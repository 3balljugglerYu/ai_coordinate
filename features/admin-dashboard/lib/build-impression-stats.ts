/**
 * インプレッション集計RPC(`get_post_impression_stats`)の戻り値を整形する純ロジック。
 *
 * SQL 側は jsonb を返すため型が付かない。ここで形を検証して落とし、
 * 想定外の値が入っても画面が落ちないようにする(admin は運営の目であって、
 * 数値が1つ欠けたくらいで真っ白になる方が困る)。
 */

export interface ImpressionDailyPoint {
  /** JST の日付 (YYYY-MM-DD) */
  date: string;
  /** チャートのX軸ラベル (M/D) */
  label: string;
  impressions: number;
  uniqueViewers: number;
  uniquePosts: number;
  grid: number;
  feed: number;
  detail: number;
  /** 表示形式の記録を始める前(2026-08-12以前)の行 */
  unknown: number;
  authenticated: number;
  guest: number;
}

export interface ImpressionTotals {
  impressions: number;
  uniqueViewers: number;
  uniquePosts: number;
  grid: number;
  feed: number;
  detail: number;
  unknown: number;
  authenticated: number;
  guest: number;
  /** 1投稿あたりの平均インプレッション */
  averagePerPost: number;
}

export interface ImpressionTopPostRef {
  imageId: string;
  impressions: number;
  uniqueViewers: number;
}

export interface ParsedImpressionStats {
  daily: ImpressionDailyPoint[];
  totals: ImpressionTotals;
  topPostRefs: ImpressionTopPostRef[];
}

const EMPTY_TOTALS: ImpressionTotals = {
  impressions: 0,
  uniqueViewers: 0,
  uniquePosts: 0,
  grid: 0,
  feed: 0,
  detail: 0,
  unknown: 0,
  authenticated: 0,
  guest: 0,
  averagePerPost: 0,
};

function toCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

/**
 * 内訳の比率表示。
 *
 * 単純な四捨五入だと「フィード 3件 → 0%」のように、件数があるのに 0% と出て
 * 壊れて見える。表示形式の記録は途中から始めたので、しばらく分母(不明)が
 * 大きいままになる。0 でないのに 0% になる場合は「1%未満」と出す。
 */
export function formatImpressionShare(value: number, total: number): string {
  if (total <= 0 || value <= 0) {
    return "0%";
  }
  const rounded = Math.round((value / total) * 100);
  return rounded === 0 ? "1%未満" : `${rounded}%`;
}

/** "2026-08-12" → "8/12"。文字列から切り出す(Date を通すとタイムゾーンでずれる)。 */
export function formatImpressionDateLabel(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    return date;
  }
  return `${Number(match[2])}/${Number(match[3])}`;
}

export function parseImpressionStats(raw: unknown): ParsedImpressionStats {
  if (!raw || typeof raw !== "object") {
    return { daily: [], totals: EMPTY_TOTALS, topPostRefs: [] };
  }

  const source = raw as Record<string, unknown>;

  const dailyRaw = Array.isArray(source.daily) ? source.daily : [];
  const daily: ImpressionDailyPoint[] = dailyRaw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }
    const row = entry as Record<string, unknown>;
    const date = typeof row.date === "string" ? row.date : null;
    if (!date) {
      return [];
    }
    return [
      {
        date,
        label: formatImpressionDateLabel(date),
        impressions: toCount(row.impressions),
        uniqueViewers: toCount(row.unique_viewers),
        uniquePosts: toCount(row.unique_posts),
        grid: toCount(row.grid),
        feed: toCount(row.feed),
        detail: toCount(row.detail),
        unknown: toCount(row.unknown),
        authenticated: toCount(row.authenticated),
        guest: toCount(row.guest),
      },
    ];
  });

  const totalsRaw =
    source.totals && typeof source.totals === "object"
      ? (source.totals as Record<string, unknown>)
      : {};
  const impressions = toCount(totalsRaw.impressions);
  const uniquePosts = toCount(totalsRaw.unique_posts);

  const totals: ImpressionTotals = {
    impressions,
    uniqueViewers: toCount(totalsRaw.unique_viewers),
    uniquePosts,
    grid: toCount(totalsRaw.grid),
    feed: toCount(totalsRaw.feed),
    detail: toCount(totalsRaw.detail),
    unknown: toCount(totalsRaw.unknown),
    authenticated: toCount(totalsRaw.authenticated),
    guest: toCount(totalsRaw.guest),
    // 0除算をここで潰す(投稿が1件も見られていない期間は 0 でよい)
    averagePerPost:
      uniquePosts > 0 ? Math.round((impressions / uniquePosts) * 10) / 10 : 0,
  };

  const topRaw = Array.isArray(source.topPosts) ? source.topPosts : [];
  const topPostRefs: ImpressionTopPostRef[] = topRaw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }
    const row = entry as Record<string, unknown>;
    const imageId = typeof row.image_id === "string" ? row.image_id : null;
    if (!imageId) {
      return [];
    }
    return [
      {
        imageId,
        impressions: toCount(row.impressions),
        uniqueViewers: toCount(row.unique_viewers),
      },
    ];
  });

  return { daily, totals, topPostRefs };
}
