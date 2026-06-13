import {
  enumerateJstDateKeys,
  formatJstDateLabel,
  isWithinDateRange,
  toJstDateKey,
} from "./dashboard-range";

export interface OutfitGenerationCount {
  presetId: string;
  count: number;
}

export type DeltaDirection = "up" | "down" | "flat";

export interface CollectionKpiMetric {
  current: number;
  previous: number;
  deltaPct: number | null;
  deltaDirection: DeltaDirection;
  // current 期間のログイン/ゲスト内訳(分離可能な指標のみ設定)
  member?: number;
  guest?: number;
}

export interface CollectionTrendPoint {
  bucket: string; // JST date key "YYYY-MM-DD"
  label: string; // "M/D"
  completions: number;
  seriesGenerations: number;
  visitsMember: number;
  visitsGuest: number;
  generates: number;
  generatesGuest: number; // お試し生成(未ログイン)
  downloads: number;
  downloadsMember: number;
  downloadsGuest: number;
  saveClicks: number;
  signupClicks: number;
  shares: number;
}

export interface CollectionKpi {
  categoryKey: string;
  completions: CollectionKpiMetric;
  mountsFailed: CollectionKpiMetric;
  seriesGenerations: CollectionKpiMetric;
  visitsMember: CollectionKpiMetric;
  visitsGuest: CollectionKpiMetric;
  generates: CollectionKpiMetric;
  downloads: CollectionKpiMetric;
  saveClicks: CollectionKpiMetric;
  signupClicks: CollectionKpiMetric;
  shares: CollectionKpiMetric;
  outfitCounts: OutfitGenerationCount[];
  trend: CollectionTrendPoint[];
}

// 集計元の生行(getCollectionKpi が Supabase から取得して渡す)
export interface CollectionCompletionRow {
  mount_status: string | null;
  completed_at: string | null;
}

export interface CollectionImageJobRow {
  created_at: string;
  generation_metadata: Record<string, unknown> | null;
}

export interface CollectionEventRow {
  auth_state: string | null;
  event_type: string | null;
  created_at: string;
}

/**
 * image_jobs.generation_metadata から oneTapStyle.id を安全に取り出す。
 * 旧 SQL `generation_metadata->oneTapStyle->>id` の JS 等価。
 * 欠落・型不一致は null(= SQL の null と同じく未カウント)。
 */
export function extractOneTapStyleId(
  metadata: Record<string, unknown> | null,
): string | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const oneTapStyle = (metadata as Record<string, unknown>)["oneTapStyle"];
  if (!oneTapStyle || typeof oneTapStyle !== "object") {
    return null;
  }
  const id = (oneTapStyle as Record<string, unknown>)["id"];
  return typeof id === "string" ? id : null;
}

// dashboard 全体で重複している calculateDelta と同一ロジック(既知の重複)。
function calculateDelta(current: number, previous: number): {
  deltaPct: number | null;
  deltaDirection: DeltaDirection;
} {
  if (previous === 0) {
    if (current === 0) {
      return { deltaPct: 0, deltaDirection: "flat" };
    }
    return { deltaPct: null, deltaDirection: "up" };
  }

  const deltaPct = Number((((current - previous) / previous) * 100).toFixed(1));

  if (deltaPct > 0) {
    return { deltaPct, deltaDirection: "up" };
  }
  if (deltaPct < 0) {
    return { deltaPct: Math.abs(deltaPct), deltaDirection: "down" };
  }
  return { deltaPct: 0, deltaDirection: "flat" };
}

function toMetric(
  current: number,
  previous: number,
  auth?: { member: number; guest: number },
): CollectionKpiMetric {
  const { deltaPct, deltaDirection } = calculateDelta(current, previous);
  const base: CollectionKpiMetric = {
    current,
    previous,
    deltaPct,
    deltaDirection,
  };
  return auth ? { ...base, member: auth.member, guest: auth.guest } : base;
}

interface RangeCounter {
  current: number;
  previous: number;
}

function createCounter(): RangeCounter {
  return { current: 0, previous: 0 };
}

/**
 * 指定シリーズの KPI を期間付きで集計する純関数(I/O なし・テスト対象)。
 * - current = [currentStart, now], previous = [previousStart, currentStart]
 * - trend は currentStart..now を JST 日別でゼロ埋めした配列
 * - visits / generates / downloads はログイン(member) / ゲスト(guest) 内訳も集計
 * - shareRows は mount_shared イベント(style_id を持たないため別取得)。
 *   現状コレクション横断のため series 固有ではない点に注意(category 付与は別途)。
 * - 達成者ロスター(累計)は別関数 getCollectionCompleters の責務(ここには含めない)
 */
export function buildCollectionKpi(params: {
  categoryKey: string;
  presetIds: string[];
  completionRows: CollectionCompletionRow[];
  imageJobRows: CollectionImageJobRow[];
  eventRows: CollectionEventRow[];
  shareRows: CollectionEventRow[];
  currentStart: Date;
  previousStart: Date;
  now: Date;
}): CollectionKpi {
  const {
    categoryKey,
    presetIds,
    completionRows,
    imageJobRows,
    eventRows,
    shareRows,
    currentStart,
    previousStart,
    now,
  } = params;

  const dayKeys = enumerateJstDateKeys(currentStart, now);
  const trendMap = new Map<string, CollectionTrendPoint>(
    dayKeys.map((key) => [
      key,
      {
        bucket: key,
        label: formatJstDateLabel(key),
        completions: 0,
        seriesGenerations: 0,
        visitsMember: 0,
        visitsGuest: 0,
        generates: 0,
        generatesGuest: 0,
        downloads: 0,
        downloadsMember: 0,
        downloadsGuest: 0,
        saveClicks: 0,
        signupClicks: 0,
        shares: 0,
      },
    ]),
  );

  const inCurrent = (value: string) => isWithinDateRange(value, currentStart, now);
  const inPrevious = (value: string) =>
    isWithinDateRange(value, previousStart, currentStart);

  const completions = createCounter();
  const mountsFailed = createCounter();
  const seriesGenerations = createCounter();
  const visitsMember = createCounter();
  const visitsGuest = createCounter();
  const generates = createCounter();
  const downloads = createCounter();
  const saveClicks = createCounter();
  const signupClicks = createCounter();
  const shares = createCounter();
  // current 期間の member/guest 内訳
  let generatesMemberCur = 0;
  let generatesGuestCur = 0;
  let downloadsMemberCur = 0;
  let downloadsGuestCur = 0;
  const outfitMap = new Map<string, number>();

  // collection_completions(completed / failed)
  for (const row of completionRows) {
    if (!row.completed_at) {
      continue;
    }
    const cur = inCurrent(row.completed_at);
    const prev = !cur && inPrevious(row.completed_at);
    if (!cur && !prev) {
      continue;
    }

    if (row.mount_status === "completed") {
      if (cur) {
        completions.current += 1;
        const bucket = trendMap.get(toJstDateKey(row.completed_at));
        if (bucket) bucket.completions += 1;
      } else {
        completions.previous += 1;
      }
    } else if (row.mount_status === "failed") {
      if (cur) mountsFailed.current += 1;
      else mountsFailed.previous += 1;
    }
  }

  // image_jobs(成功ジョブ): シリーズ生成数 + 衣装別
  for (const row of imageJobRows) {
    const cur = inCurrent(row.created_at);
    const prev = !cur && inPrevious(row.created_at);
    if (!cur && !prev) {
      continue;
    }

    if (cur) {
      seriesGenerations.current += 1;
      const bucket = trendMap.get(toJstDateKey(row.created_at));
      if (bucket) bucket.seriesGenerations += 1;
      const presetId = extractOneTapStyleId(row.generation_metadata);
      if (presetId) {
        outfitMap.set(presetId, (outfitMap.get(presetId) ?? 0) + 1);
      }
    } else {
      seriesGenerations.previous += 1;
    }
  }

  // style_usage_events: 企画ファネル(visit/generate/download/save/signup)
  for (const row of eventRows) {
    const cur = inCurrent(row.created_at);
    const prev = !cur && inPrevious(row.created_at);
    if (!cur && !prev) {
      continue;
    }
    const bucket = cur ? trendMap.get(toJstDateKey(row.created_at)) : undefined;
    const isGuest = row.auth_state === "guest";
    const isMember = row.auth_state === "authenticated";

    switch (row.event_type) {
      case "visit":
        if (isMember) {
          if (cur) {
            visitsMember.current += 1;
            if (bucket) bucket.visitsMember += 1;
          } else {
            visitsMember.previous += 1;
          }
        } else if (isGuest) {
          if (cur) {
            visitsGuest.current += 1;
            if (bucket) bucket.visitsGuest += 1;
          } else {
            visitsGuest.previous += 1;
          }
        }
        break;
      case "generate":
        if (cur) {
          generates.current += 1;
          if (isMember) generatesMemberCur += 1;
          else if (isGuest) generatesGuestCur += 1;
          if (bucket) {
            bucket.generates += 1;
            if (isGuest) bucket.generatesGuest += 1;
          }
        } else {
          generates.previous += 1;
        }
        break;
      case "download":
        if (cur) {
          downloads.current += 1;
          if (isMember) downloadsMemberCur += 1;
          else if (isGuest) downloadsGuestCur += 1;
          if (bucket) {
            bucket.downloads += 1;
            if (isMember) bucket.downloadsMember += 1;
            else if (isGuest) bucket.downloadsGuest += 1;
          }
        } else {
          downloads.previous += 1;
        }
        break;
      case "wardrobe_save_click":
        if (cur) {
          saveClicks.current += 1;
          if (bucket) bucket.saveClicks += 1;
        } else {
          saveClicks.previous += 1;
        }
        break;
      case "signup_click":
        if (cur) {
          signupClicks.current += 1;
          if (bucket) bucket.signupClicks += 1;
        } else {
          signupClicks.previous += 1;
        }
        break;
      default:
        break;
    }
  }

  // mount_shared(台紙シェア)。style_id を持たないため別取得。
  for (const row of shareRows) {
    if (row.event_type !== "mount_shared") {
      continue;
    }
    const cur = inCurrent(row.created_at);
    const prev = !cur && inPrevious(row.created_at);
    if (cur) {
      shares.current += 1;
      const bucket = trendMap.get(toJstDateKey(row.created_at));
      if (bucket) bucket.shares += 1;
    } else if (prev) {
      shares.previous += 1;
    }
  }

  // 衣装別: preset の display_order を維持(0 件も含めて表示)
  const outfitCounts: OutfitGenerationCount[] = presetIds.map((presetId) => ({
    presetId,
    count: outfitMap.get(presetId) ?? 0,
  }));

  return {
    categoryKey,
    completions: toMetric(completions.current, completions.previous),
    mountsFailed: toMetric(mountsFailed.current, mountsFailed.previous),
    seriesGenerations: toMetric(
      seriesGenerations.current,
      seriesGenerations.previous,
    ),
    visitsMember: toMetric(visitsMember.current, visitsMember.previous),
    visitsGuest: toMetric(visitsGuest.current, visitsGuest.previous),
    generates: toMetric(generates.current, generates.previous, {
      member: generatesMemberCur,
      guest: generatesGuestCur,
    }),
    downloads: toMetric(downloads.current, downloads.previous, {
      member: downloadsMemberCur,
      guest: downloadsGuestCur,
    }),
    saveClicks: toMetric(saveClicks.current, saveClicks.previous),
    signupClicks: toMetric(signupClicks.current, signupClicks.previous),
    shares: toMetric(shares.current, shares.previous),
    outfitCounts,
    trend: dayKeys.map((key) => trendMap.get(key)!),
  };
}
