import { isWithinDateRange } from "./dashboard-range";
import {
  extractOneTapStyleId,
  type CollectionCompletionRow,
  type CollectionImageJobRow,
  type CollectionPreset,
} from "./build-collection-kpi";

/**
 * 「どこで止まったか」を出す集計(Phase 3)。
 *
 * 既存の KPI は**ページ別の生成数**しか持っていなかった。生成数だけだと
 * 「人が多かった」のか「一人が粘った」のかを区別できない。ファッション雑誌企画では
 * P.1 が 41件だったが、それが 29人ぶんなのか 5人ぶんなのかで意味が真逆になる
 * (実際は 29人 = ほぼ全員が1回ずつ + 少数の撮り直しだった)。
 *
 * 手集計で最も行動につながったのは**到達ページ数の分布**で、
 * 「離脱は最初の1〜2枚に集中していて、4枚以上進んだ人の82.6%は完走する」
 * 「7枚で止まった人が2名いる」が読み取れた。ここを画面に載せる。
 *
 * `buildCollectionKpi` に足さず別の純関数にしているのは、あちらが
 * すでに単体テストで固められており、触ると既存の指標を巻き込むため。
 * 入力は同じ行を使い回すので追加のクエリは要らない。
 */

export interface CollectionPageReach {
  presetId: string;
  label: string;
  /** そのページを1回以上生成した人数 */
  reachedUu: number;
}

export interface CollectionPageCountBucket {
  /** 生成したページの種類数(1..N) */
  pages: number;
  users: number;
}

export interface CollectionParticipation {
  /**
   * ページ別の到達UU。生成数は `outfitCounts` が正本なので**ここには持たない**
   * (同じ数を2箇所で数えると必ずどこかでずれる)。表示側で presetId で突き合わせる。
   */
  pageReach: CollectionPageReach[];
  /** 到達ページ数ごとの人数。0人のページ数も 0 で埋める(離脱の谷が見えるように) */
  pageCountDistribution: CollectionPageCountBucket[];
  /** 1回以上生成した人数 */
  generatorUu: number;
  /** 完走した人数(集計期間内) */
  completerUu: number;
  /** 1人あたり平均生成回数。参加者0人なら null */
  avgGenerationsPerUser: number | null;
  /** 完走者に限った平均生成回数。完走者0人なら null */
  completerAvgGenerations: number | null;
  /**
   * 撮り直し率。全生成のうち「同じページの2回目以降」が占める割合。
   * 全8ページなら最低8回で揃うので、これを超えたぶんが作り直し。
   */
  redoRatePct: number | null;
}

function roundTo1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * @param presets 当該カテゴリの preset 一覧(表示順)
 * @param imageJobRows 成功ジョブ。`user_id` と `generation_metadata` を使う
 * @param completionRows 完走行。`user_id` と `completed_at` を使う
 */
export function buildCollectionParticipation(params: {
  presets: CollectionPreset[];
  imageJobRows: CollectionImageJobRow[];
  completionRows: CollectionCompletionRow[];
  currentStart: Date;
  now: Date;
}): CollectionParticipation {
  const { presets, imageJobRows, completionRows, currentStart, now } = params;

  // ユーザー -> そのユーザーが生成したページ -> 回数
  const generationsByUser = new Map<string, Map<string, number>>();
  // ページ -> 生成した人の集合
  const reachByPreset = new Map<string, Set<string>>();
  let totalGenerations = 0;

  for (const row of imageJobRows) {
    if (!isWithinDateRange(row.created_at, currentStart, now)) continue;
    const userId = row.user_id;
    // 生成は必ずログインユーザーに紐づく。user_id が無い行は人数に数えられない
    if (!userId) continue;

    totalGenerations += 1;

    const presetId = extractOneTapStyleId(row.generation_metadata);
    let byPreset = generationsByUser.get(userId);
    if (!byPreset) {
      byPreset = new Map<string, number>();
      generationsByUser.set(userId, byPreset);
    }
    /*
      プリセットが特定できない行(旧データ・メタデータ欠落)も、
      生成回数と参加者には数える。ページ別の到達には数えない。
      ここで丸ごと捨てると「生成数の合計とページ別の合計が合わない」より
      たちの悪い「参加者が少なく見える」が起きる。
    */
    if (!presetId) continue;

    byPreset.set(presetId, (byPreset.get(presetId) ?? 0) + 1);

    let reached = reachByPreset.get(presetId);
    if (!reached) {
      reached = new Set<string>();
      reachByPreset.set(presetId, reached);
    }
    reached.add(userId);
  }

  const completerUserIds = new Set<string>();
  for (const row of completionRows) {
    if (row.mount_status !== "completed") continue;
    if (!row.completed_at) continue;
    if (!isWithinDateRange(row.completed_at, currentStart, now)) continue;
    if (row.user_id) completerUserIds.add(row.user_id);
  }

  const pageReach: CollectionPageReach[] = presets.map((preset) => ({
    presetId: preset.id,
    label: preset.label,
    reachedUu: reachByPreset.get(preset.id)?.size ?? 0,
  }));

  // 到達ページ数の分布。1..presets.length を必ず埋める(0人の谷も見せる)
  const usersByPageCount = new Map<number, number>();
  let distinctPageSlots = 0;
  for (const byPreset of generationsByUser.values()) {
    const pages = byPreset.size;
    distinctPageSlots += pages;
    if (pages === 0) continue;
    usersByPageCount.set(pages, (usersByPageCount.get(pages) ?? 0) + 1);
  }
  const maxPages = Math.max(
    presets.length,
    ...Array.from(usersByPageCount.keys(), (n) => n),
    0,
  );
  const pageCountDistribution: CollectionPageCountBucket[] = Array.from(
    { length: maxPages },
    (_, index) => ({
      pages: index + 1,
      users: usersByPageCount.get(index + 1) ?? 0,
    }),
  );

  const generatorUu = generationsByUser.size;

  let completerGenerations = 0;
  let completerCount = 0;
  for (const [userId, byPreset] of generationsByUser) {
    if (!completerUserIds.has(userId)) continue;
    completerCount += 1;
    for (const count of byPreset.values()) {
      completerGenerations += count;
    }
  }

  return {
    pageReach,
    pageCountDistribution,
    generatorUu,
    completerUu: completerUserIds.size,
    avgGenerationsPerUser:
      generatorUu > 0 ? roundTo1(totalGenerations / generatorUu) : null,
    completerAvgGenerations:
      completerCount > 0 ? roundTo1(completerGenerations / completerCount) : null,
    /*
      同じページを2回以上作ったぶんの割合。
      分母は総生成数、分子は「総生成数 - のべ到達ページ数」。
      プリセット不明の行は到達ページに数えていないため、この式では
      作り直し側に寄る。旧データが混ざる企画では上振れしうる。
    */
    redoRatePct:
      totalGenerations > 0
        ? roundTo1(
            ((totalGenerations - distinctPageSlots) / totalGenerations) * 100,
          )
        : null,
  };
}
