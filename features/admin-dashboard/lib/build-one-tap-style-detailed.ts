import {
  isWithinDateRange,
} from "./dashboard-range";
import { getOneTapStylePresetMetadata } from "@/shared/generation/one-tap-style-metadata";
import type {
  DashboardDeltaDirection,
  DashboardOneTapStyleDetailedAnalytics,
  DashboardOneTapStyleFocusMetric,
  DashboardOneTapStyleInsight,
  DashboardOneTapStyleOperationalSummary,
  DashboardOneTapStylePresetPerformanceRow,
  DashboardOneTapStyleSegmentRow,
  DashboardOneTapStyleSignupFunnel,
  DashboardOneTapStyleSignupFunnelStep,
} from "./dashboard-types";
import { buildOneTapStyleAnalytics } from "./build-one-tap-style-summary";
import type { StyleUsageEventRow } from "./build-one-tap-style-summary";

export interface StyleGuestGenerateAttemptRow {
  created_at: string;
}

export interface StylePresetDashboardRow {
  id: string;
  title: string;
  status: "draft" | "published";
  sort_order: number;
}

export interface StyleGeneratedImageRow {
  created_at: string;
  is_posted: boolean | null;
  generation_type?: string | null;
  generation_metadata?: Record<string, unknown> | null;
}

export interface StyleSignupProfileRow {
  user_id: string;
  created_at: string;
  signup_source?: string | null;
}

interface StyleEventCounters {
  visits: number;
  authenticatedAttempts: number;
  guestAttempts: number;
  authenticatedGenerations: number;
  guestGenerations: number;
  downloads: number;
  authenticatedRateLimited: number;
  guestRateLimited: number;
}

interface StylePresetCounters {
  authenticatedAttempts: number;
  guestAttempts: number;
  authenticatedGenerations: number;
  guestGenerations: number;
  generations: number;
  downloads: number;
  postedCount: number;
  paidGenerations: number;
  rateLimited: number;
}

function createStyleEventCounters(): StyleEventCounters {
  return {
    visits: 0,
    authenticatedAttempts: 0,
    guestAttempts: 0,
    authenticatedGenerations: 0,
    guestGenerations: 0,
    downloads: 0,
    authenticatedRateLimited: 0,
    guestRateLimited: 0,
  };
}

function createStylePresetCounters(): StylePresetCounters {
  return {
    authenticatedAttempts: 0,
    guestAttempts: 0,
    authenticatedGenerations: 0,
    guestGenerations: 0,
    generations: 0,
    downloads: 0,
    postedCount: 0,
    paidGenerations: 0,
    rateLimited: 0,
  };
}

function createSignupFunnelStep(params: {
  label: string;
  count: number;
  previousCount: number;
}): DashboardOneTapStyleSignupFunnelStep {
  return {
    label: params.label,
    count: params.count,
    rateFromPrevious: safeRate(params.count, params.previousCount),
  };
}

function countGuestAttempts(
  rows: StyleGuestGenerateAttemptRow[],
  start: Date,
  end: Date
): number {
  return rows.filter((row) => isWithinDateRange(row.created_at, start, end)).length;
}

function applyEventCounters(
  counters: StyleEventCounters,
  event: StyleUsageEventRow
) {
  if (event.event_type === "visit") {
    counters.visits += 1;
    return;
  }

  if (event.auth_state === "authenticated" && event.event_type === "generate_attempt") {
    counters.authenticatedAttempts += 1;
    return;
  }

  if (event.auth_state === "guest" && event.event_type === "generate_attempt") {
    counters.guestAttempts += 1;
    return;
  }

  if (event.event_type === "generate") {
    if (event.auth_state === "authenticated") {
      counters.authenticatedGenerations += 1;
    } else if (event.auth_state === "guest") {
      counters.guestGenerations += 1;
    }
    return;
  }

  if (event.event_type === "download") {
    counters.downloads += 1;
    return;
  }

  if (event.event_type === "rate_limited") {
    if (event.auth_state === "authenticated") {
      counters.authenticatedRateLimited += 1;
    } else if (event.auth_state === "guest") {
      counters.guestRateLimited += 1;
    }
  }
}

function aggregateStyleEvents(
  events: StyleUsageEventRow[],
  start: Date,
  end: Date
) {
  const total = createStyleEventCounters();
  const authenticated = createStyleEventCounters();
  const guest = createStyleEventCounters();
  const presetMap = new Map<string, StylePresetCounters>();

  for (const event of events) {
    if (!isWithinDateRange(event.created_at, start, end)) {
      continue;
    }

    applyEventCounters(total, event);

    if (event.auth_state === "authenticated") {
      applyEventCounters(authenticated, event);
    } else if (event.auth_state === "guest") {
      applyEventCounters(guest, event);
    }

    if (!event.style_id) {
      continue;
    }

    let presetCounters = presetMap.get(event.style_id);
    if (!presetCounters) {
      presetCounters = createStylePresetCounters();
      presetMap.set(event.style_id, presetCounters);
    }

    if (event.auth_state === "authenticated" && event.event_type === "generate_attempt") {
      presetCounters.authenticatedAttempts += 1;
      continue;
    }

    if (event.auth_state === "guest" && event.event_type === "generate_attempt") {
      presetCounters.guestAttempts += 1;
      continue;
    }

    if (event.auth_state === "authenticated" && event.event_type === "generate") {
      presetCounters.authenticatedGenerations += 1;
    } else if (event.auth_state === "guest" && event.event_type === "generate") {
      presetCounters.guestGenerations += 1;
    }

    if (event.event_type === "generate") {
      presetCounters.generations += 1;
      continue;
    }

    if (event.event_type === "download") {
      presetCounters.downloads += 1;
      continue;
    }

    if (event.event_type === "rate_limited") {
      presetCounters.rateLimited += 1;
    }
  }

  return {
    total,
    authenticated,
    guest,
    presetMap,
  };
}

function aggregateStyleGeneratedImages(
  images: StyleGeneratedImageRow[],
  start: Date,
  end: Date
) {
  const presetPostedMap = new Map<string, number>();
  const presetPaidMap = new Map<string, number>();
  let paidGenerationCount = 0;

  for (const image of images) {
    if (!isWithinDateRange(image.created_at, start, end)) {
      continue;
    }

    const presetMetadata = getOneTapStylePresetMetadata(image);
    if (!presetMetadata) {
      continue;
    }

    if (presetMetadata.billingMode === "paid") {
      paidGenerationCount += 1;
      presetPaidMap.set(
        presetMetadata.id,
        (presetPaidMap.get(presetMetadata.id) ?? 0) + 1
      );
    }

    if (image.is_posted) {
      presetPostedMap.set(
        presetMetadata.id,
        (presetPostedMap.get(presetMetadata.id) ?? 0) + 1
      );
    }
  }

  return {
    presetPostedMap,
    presetPaidMap,
    paidGenerationCount,
  };
}

function aggregateStyleSignupFunnel(params: {
  profiles: StyleSignupProfileRow[];
  events: StyleUsageEventRow[];
  start: Date;
  end: Date;
}): DashboardOneTapStyleSignupFunnel {
  const styleSignupProfiles = params.profiles.filter(
    (profile) =>
      profile.signup_source === "style" &&
      isWithinDateRange(profile.created_at, params.start, params.end)
  );
  const signupCreatedAtMap = new Map(
    styleSignupProfiles.map((profile) => [profile.user_id, Date.parse(profile.created_at)])
  );
  const returnedUsers = new Set<string>();
  const generatedUsers = new Set<string>();
  let ctaClicks = 0;

  for (const event of params.events) {
    if (!isWithinDateRange(event.created_at, params.start, params.end)) {
      continue;
    }

    if (event.event_type === "signup_click") {
      ctaClicks += 1;
      continue;
    }

    if (event.auth_state !== "authenticated" || !event.user_id) {
      continue;
    }

    const signupCreatedAtMs = signupCreatedAtMap.get(event.user_id);
    if (
      typeof signupCreatedAtMs !== "number" ||
      Number.isNaN(signupCreatedAtMs) ||
      Date.parse(event.created_at) < signupCreatedAtMs
    ) {
      continue;
    }

    returnedUsers.add(event.user_id);

    if (event.event_type === "generate") {
      generatedUsers.add(event.user_id);
    }
  }

  const signupCount = styleSignupProfiles.length;
  const returnCount = returnedUsers.size;
  const firstGenerationCount = generatedUsers.size;

  return {
    steps: [
      { label: "CTAクリック数", count: ctaClicks, rateFromPrevious: null },
      createSignupFunnelStep({
        label: "登録完了数",
        count: signupCount,
        previousCount: ctaClicks,
      }),
      createSignupFunnelStep({
        label: "style復帰数",
        count: returnCount,
        previousCount: signupCount,
      }),
      createSignupFunnelStep({
        label: "初回生成数",
        count: firstGenerationCount,
        previousCount: returnCount,
      }),
    ],
    clickToSignupRatePct: safeRate(signupCount, ctaClicks),
    signupReturnRatePct: safeRate(returnCount, signupCount),
    signupGenerationRatePct: safeRate(firstGenerationCount, signupCount),
  };
}

function toGenerationCount(counters: StyleEventCounters): number {
  return counters.authenticatedGenerations + counters.guestGenerations;
}

function calculateDelta(
  current: number,
  previous: number
): {
  deltaPct: number | null;
  deltaDirection: DashboardDeltaDirection;
} {
  if (previous === 0) {
    if (current === 0) {
      return { deltaPct: 0, deltaDirection: "flat" };
    }

    return { deltaPct: null, deltaDirection: "up" };
  }

  const deltaPct = Number(
    (((current - previous) / previous) * 100).toFixed(1)
  );

  if (deltaPct > 0) {
    return { deltaPct, deltaDirection: "up" };
  }

  if (deltaPct < 0) {
    return {
      deltaPct: Math.abs(deltaPct),
      deltaDirection: "down",
    };
  }

  return { deltaPct: 0, deltaDirection: "flat" };
}

function formatInteger(value: number): string {
  return value.toLocaleString("ja-JP");
}

function formatPercent(value: number | null): string {
  if (value === null) {
    return "N/A";
  }

  return `${value.toLocaleString("ja-JP", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function safeRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }

  return Number(((numerator / denominator) * 100).toFixed(1));
}

function createFocusMetric(params: {
  key: DashboardOneTapStyleFocusMetric["key"];
  label: string;
  currentValueText: string;
  previousValueText: string;
  currentComparableValue: number;
  previousComparableValue: number;
  description: string;
}): DashboardOneTapStyleFocusMetric {
  const { deltaPct, deltaDirection } = calculateDelta(
    params.currentComparableValue,
    params.previousComparableValue
  );

  return {
    key: params.key,
    label: params.label,
    value: params.currentValueText,
    previousValue: params.previousValueText,
    deltaPct,
    deltaDirection,
    description: params.description,
  };
}

function buildSegmentRow(params: {
  authState: DashboardOneTapStyleSegmentRow["authState"];
  label: string;
  counters: StyleEventCounters;
  guestAttemptCount?: number;
  paidGenerations?: number;
}): DashboardOneTapStyleSegmentRow {
  const generations = toGenerationCount(params.counters);
  const attempts =
    params.authState === "guest"
      ? params.guestAttemptCount ?? 0
      : params.counters.authenticatedAttempts;
  const rateLimited =
    params.authState === "guest"
      ? params.counters.guestRateLimited
      : params.counters.authenticatedRateLimited;

  return {
    authState: params.authState,
    label: params.label,
    visits: params.counters.visits,
    attempts,
    generations,
    downloads: params.counters.downloads,
    rateLimited,
    paidGenerations: params.paidGenerations ?? 0,
    successRatePct: safeRate(generations, attempts),
    downloadRatePct: safeRate(params.counters.downloads, generations),
    rateLimitedSharePct: safeRate(rateLimited, attempts + rateLimited),
    paidGenerationRatePct:
      params.authState === "authenticated"
        ? safeRate(
            params.paidGenerations ?? 0,
            params.counters.authenticatedGenerations
          )
        : null,
  };
}

function buildPresetPerformance(params: {
  presets: StylePresetDashboardRow[];
  currentPresetCounters: Map<string, StylePresetCounters>;
  currentPresetPostedMap: Map<string, number>;
  currentPresetPaidMap: Map<string, number>;
  totalGenerations: number;
}): DashboardOneTapStylePresetPerformanceRow[] {
  const presetMetaMap = new Map(
    params.presets.map((preset) => [preset.id, preset] as const)
  );
  const allPresetIds = new Set([
    ...params.presets.map((preset) => preset.id),
    ...params.currentPresetCounters.keys(),
  ]);

  const rows = Array.from(allPresetIds).map((presetId) => {
    const presetMeta = presetMetaMap.get(presetId);
    const counters =
      params.currentPresetCounters.get(presetId) ?? createStylePresetCounters();
    const status: DashboardOneTapStylePresetPerformanceRow["status"] =
      presetMeta?.status ?? "unknown";

    return {
      presetId,
      title: presetMeta?.title ?? "未登録スタイル",
      status,
      authenticatedAttempts: counters.authenticatedAttempts,
      guestAttempts: counters.guestAttempts,
      generations: counters.generations,
      downloads: counters.downloads,
      postedCount: params.currentPresetPostedMap.get(presetId) ?? 0,
      paidGenerations: params.currentPresetPaidMap.get(presetId) ?? 0,
      rateLimited: counters.rateLimited,
      generationSharePct:
        params.totalGenerations > 0
          ? Number(
              ((counters.generations / params.totalGenerations) * 100).toFixed(1)
            )
          : 0,
      authenticatedSuccessRatePct: safeRate(
        counters.authenticatedGenerations,
        counters.authenticatedAttempts
      ),
      guestSuccessRatePct: safeRate(
        counters.guestGenerations,
        counters.guestAttempts
      ),
      downloadRatePct: safeRate(counters.downloads, counters.generations),
      postRatePct: safeRate(
        params.currentPresetPostedMap.get(presetId) ?? 0,
        counters.generations
      ),
      paidGenerationRatePct: safeRate(
        params.currentPresetPaidMap.get(presetId) ?? 0,
        counters.authenticatedGenerations
      ),
    };
  });

  return rows.toSorted((left, right) => {
    const leftSortOrder = presetMetaMap.get(left.presetId)?.sort_order ?? Number.MAX_SAFE_INTEGER;
    const rightSortOrder =
      presetMetaMap.get(right.presetId)?.sort_order ?? Number.MAX_SAFE_INTEGER;

    return (
      right.generations - left.generations ||
      right.downloads - left.downloads ||
      leftSortOrder - rightSortOrder ||
      left.title.localeCompare(right.title, "ja")
    );
  });
}

function buildOperationalSummary(params: {
  presets: StylePresetDashboardRow[];
  presetPerformance: DashboardOneTapStylePresetPerformanceRow[];
  authenticatedAttemptCount: number;
  guestAttemptCount: number;
  paidGenerationCount: number;
}): DashboardOneTapStyleOperationalSummary {
  const publishedPresetCount = params.presets.filter(
    (preset) => preset.status === "published"
  ).length;
  const draftPresetCount = params.presets.filter(
    (preset) => preset.status === "draft"
  ).length;
  const activePresetCount = params.presetPerformance.filter(
    (preset) =>
      preset.authenticatedAttempts > 0 ||
      preset.generations > 0 ||
      preset.downloads > 0 ||
      preset.rateLimited > 0
  ).length;
  const zeroGenerationPublishedPresetCount = params.presetPerformance.filter(
    (preset) =>
      preset.status === "published" && preset.generations === 0
  ).length;

  return {
    publishedPresetCount,
    draftPresetCount,
    activePresetCount,
    zeroGenerationPublishedPresetCount,
    authenticatedAttemptCount: params.authenticatedAttemptCount,
    guestAttemptCount: params.guestAttemptCount,
    paidGenerationCount: params.paidGenerationCount,
  };
}

function buildInsights(params: {
  presetPerformance: DashboardOneTapStylePresetPerformanceRow[];
  operationalSummary: DashboardOneTapStyleOperationalSummary;
  authenticatedSegment: DashboardOneTapStyleSegmentRow;
  guestSegment: DashboardOneTapStyleSegmentRow;
  totalGenerations: number;
  totalDownloads: number;
  totalRateLimited: number;
  overallDownloadRatePct: number | null;
  overallRateLimitedSharePct: number | null;
}): DashboardOneTapStyleInsight[] {
  const insights: DashboardOneTapStyleInsight[] = [];
  const topPreset = params.presetPerformance.find((preset) => preset.generations > 0);
  const highDownloadPreset = params.presetPerformance
    .filter((preset) => preset.generations >= 3 && preset.downloadRatePct !== null)
    .toSorted(
      (left, right) =>
        (right.downloadRatePct ?? 0) - (left.downloadRatePct ?? 0) ||
        right.generations - left.generations
    )[0];

  if (topPreset) {
    insights.push({
      id: "top-preset",
      severity: "success",
      title: "最も反応が高いスタイルがあります",
      description: `「${topPreset.title}」が生成 ${formatInteger(
        topPreset.generations
      )} 件で最多です。ダウンロード率は ${formatPercent(
        topPreset.downloadRatePct
      )} です。`,
    });
  }

  if (
    params.overallRateLimitedSharePct !== null &&
    params.overallRateLimitedSharePct >= 15
  ) {
    insights.push({
      id: "rate-limited-pressure",
      severity: "warning",
      title: "上限到達が多めです",
      description: `対象期間の上限到達率は ${formatPercent(
        params.overallRateLimitedSharePct
      )} です。無料枠や誘導導線の見直し余地があります。`,
    });
  } else if (params.totalRateLimited > 0) {
    insights.push({
      id: "rate-limited-present",
      severity: "info",
      title: "無料枠到達は発生しています",
      description: `上限到達は ${formatInteger(
        params.totalRateLimited
      )} 件です。特にゲスト側の比率を継続監視すると、登録導線の改善余地を掴みやすいです。`,
    });
  }

  if (params.operationalSummary.zeroGenerationPublishedPresetCount > 0) {
    insights.push({
      id: "dormant-published-presets",
      severity: "warning",
      title: "公開中なのに使われていないスタイルがあります",
      description: `公開中 ${
        params.operationalSummary.publishedPresetCount
      } 件のうち ${
        params.operationalSummary.zeroGenerationPublishedPresetCount
      } 件は、対象期間で生成実績がありません。訴求順やサムネイル改善の候補です。`,
    });
  }

  if (
    params.guestSegment.rateLimitedSharePct !== null &&
    params.authenticatedSegment.rateLimitedSharePct !== null &&
    params.guestSegment.rateLimitedSharePct >
      params.authenticatedSegment.rateLimitedSharePct + 10
  ) {
    insights.push({
      id: "guest-friction",
      severity: "info",
      title: "ゲスト側で先に詰まりやすい状態です",
      description: `ゲストの上限到達率 ${formatPercent(
        params.guestSegment.rateLimitedSharePct
      )} に対し、ログインユーザーは ${formatPercent(
        params.authenticatedSegment.rateLimitedSharePct
      )} です。登録導線の改善効果が見込みやすい状態です。`,
    });
  }

  if (
    highDownloadPreset &&
    params.overallDownloadRatePct !== null &&
    (highDownloadPreset.downloadRatePct ?? 0) >=
      params.overallDownloadRatePct + 15
  ) {
    insights.push({
      id: "high-download-preset",
      severity: "success",
      title: "保存されやすいスタイルが見えています",
      description: `「${highDownloadPreset.title}」のダウンロード率は ${formatPercent(
        highDownloadPreset.downloadRatePct
      )} で、全体平均 ${formatPercent(
        params.overallDownloadRatePct
      )} を大きく上回っています。訴求面の主役候補です。`,
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: "baseline",
      severity: "info",
      title: "大きな偏りはまだ見えていません",
      description: `対象期間の生成 ${formatInteger(
        params.totalGenerations
      )} 件、ダウンロード ${formatInteger(
        params.totalDownloads
      )} 件を継続観測し、スタイル別の差分が見え始めた段階で並び順や訴求文を最適化すると効果的です。`,
    });
  }

  return insights.slice(0, 4);
}

export function buildOneTapStyleDetailedAnalytics(params: {
  events: StyleUsageEventRow[];
  guestAttempts: StyleGuestGenerateAttemptRow[];
  generatedImages: StyleGeneratedImageRow[];
  presets: StylePresetDashboardRow[];
  profiles: StyleSignupProfileRow[];
  currentStart: Date;
  previousStart: Date;
  now: Date;
}): DashboardOneTapStyleDetailedAnalytics {
  const current = aggregateStyleEvents(
    params.events,
    params.currentStart,
    params.now
  );
  const previous = aggregateStyleEvents(
    params.events,
    params.previousStart,
    params.currentStart
  );
  const currentGeneratedImages = aggregateStyleGeneratedImages(
    params.generatedImages,
    params.currentStart,
    params.now
  );
  const previousGeneratedImages = aggregateStyleGeneratedImages(
    params.generatedImages,
    params.previousStart,
    params.currentStart
  );
  const signupFunnel = aggregateStyleSignupFunnel({
    profiles: params.profiles,
    events: params.events,
    start: params.currentStart,
    end: params.now,
  });
  const currentGuestAttemptCount = countGuestAttempts(
    params.guestAttempts,
    params.currentStart,
    params.now
  );
  const previousGuestAttemptCount = countGuestAttempts(
    params.guestAttempts,
    params.previousStart,
    params.currentStart
  );

  const currentTotalGenerations = toGenerationCount(current.total);
  const previousTotalGenerations = toGenerationCount(previous.total);
  const currentAttemptCount =
    current.total.authenticatedAttempts + currentGuestAttemptCount;
  const previousAttemptCount =
    previous.total.authenticatedAttempts + previousGuestAttemptCount;
  const currentOverallDownloadRate = safeRate(
    current.total.downloads,
    currentTotalGenerations
  );
  const previousOverallDownloadRate = safeRate(
    previous.total.downloads,
    previousTotalGenerations
  );
  const currentOverallSuccessRate = safeRate(
    currentTotalGenerations,
    currentAttemptCount
  );
  const previousOverallSuccessRate = safeRate(
    previousTotalGenerations,
    previousAttemptCount
  );
  const currentOverallRateLimitedShare = safeRate(
    current.total.authenticatedRateLimited + current.total.guestRateLimited,
    currentAttemptCount +
      current.total.authenticatedRateLimited +
      current.total.guestRateLimited
  );
  const previousOverallRateLimitedShare = safeRate(
    previous.total.authenticatedRateLimited + previous.total.guestRateLimited,
    previousAttemptCount +
      previous.total.authenticatedRateLimited +
      previous.total.guestRateLimited
  );

  const authenticatedSegment = buildSegmentRow({
    authState: "authenticated",
    label: "ログインユーザー",
    counters: current.authenticated,
    paidGenerations: currentGeneratedImages.paidGenerationCount,
  });
  const guestSegment = buildSegmentRow({
    authState: "guest",
    label: "未ログインユーザー",
    counters: current.guest,
    guestAttemptCount: currentGuestAttemptCount,
  });

  const presetPerformance = buildPresetPerformance({
    presets: params.presets,
    currentPresetCounters: current.presetMap,
    currentPresetPostedMap: currentGeneratedImages.presetPostedMap,
    currentPresetPaidMap: currentGeneratedImages.presetPaidMap,
    totalGenerations: currentTotalGenerations,
  });
  const operationalSummary = buildOperationalSummary({
    presets: params.presets,
    presetPerformance,
    authenticatedAttemptCount: current.total.authenticatedAttempts,
    guestAttemptCount: currentGuestAttemptCount,
    paidGenerationCount: currentGeneratedImages.paidGenerationCount,
  });
  const dormantPublishedPresetTitles = presetPerformance
    .filter(
      (preset) => preset.status === "published" && preset.generations === 0
    )
    .map((preset) => preset.title);

  return {
    analytics: buildOneTapStyleAnalytics({
      events: params.events,
      profiles: params.profiles,
      currentStart: params.currentStart,
      previousStart: params.previousStart,
      now: params.now,
    }),
    focusMetrics: [
      createFocusMetric({
        key: "attempts",
        label: "総試行数",
        currentValueText: `${formatInteger(currentAttemptCount)}回`,
        previousValueText: `${formatInteger(previousAttemptCount)}回`,
        currentComparableValue: currentAttemptCount,
        previousComparableValue: previousAttemptCount,
        description: `ログイン ${formatInteger(
          current.total.authenticatedAttempts
        )}回 / 未ログイン ${formatInteger(currentGuestAttemptCount)}回`,
      }),
      createFocusMetric({
        key: "successRate",
        label: "生成成功率",
        currentValueText: formatPercent(currentOverallSuccessRate),
        previousValueText: formatPercent(previousOverallSuccessRate),
        currentComparableValue: currentOverallSuccessRate ?? 0,
        previousComparableValue: previousOverallSuccessRate ?? 0,
        description: `ログイン ${formatPercent(
          authenticatedSegment.successRatePct
        )} / 未ログイン ${formatPercent(guestSegment.successRatePct)}`,
      }),
      createFocusMetric({
        key: "downloadRate",
        label: "ダウンロード率",
        currentValueText: formatPercent(currentOverallDownloadRate),
        previousValueText: formatPercent(previousOverallDownloadRate),
        currentComparableValue: currentOverallDownloadRate ?? 0,
        previousComparableValue: previousOverallDownloadRate ?? 0,
        description: `生成 ${formatInteger(
          currentTotalGenerations
        )}件に対する保存率です`,
      }),
      createFocusMetric({
        key: "paidContinuations",
        label: "10ペルコイン継続数",
        currentValueText: `${formatInteger(currentGeneratedImages.paidGenerationCount)}件`,
        previousValueText: `${formatInteger(previousGeneratedImages.paidGenerationCount)}件`,
        currentComparableValue: currentGeneratedImages.paidGenerationCount,
        previousComparableValue: previousGeneratedImages.paidGenerationCount,
        description: `ログイン生成 ${formatInteger(
          authenticatedSegment.generations
        )}件のうち ${formatPercent(authenticatedSegment.paidGenerationRatePct)}`,
      }),
    ],
    segments: [authenticatedSegment, guestSegment],
    presetPerformance,
    signupFunnel,
    insights: buildInsights({
      presetPerformance,
      operationalSummary,
      authenticatedSegment,
      guestSegment,
      totalGenerations: currentTotalGenerations,
      totalDownloads: current.total.downloads,
      totalRateLimited:
        current.total.authenticatedRateLimited + current.total.guestRateLimited,
      overallDownloadRatePct: currentOverallDownloadRate,
      overallRateLimitedSharePct: currentOverallRateLimitedShare,
    }),
    operationalSummary,
    dormantPublishedPresetTitles,
  };
}
