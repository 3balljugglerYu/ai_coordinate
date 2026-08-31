/**
 * ペルコイン配布の集計を、画面が使う形に整える純関数。
 *
 * I/O を持たないのでテストしやすい。RPC の生の行をそのまま画面へ渡すと、
 * 「前期比をどこで計算するか」が UI に散らばって検算できなくなるため、
 * ここに寄せている。
 */

/** 付与元ごとの配布。source は metadata->>'bonus_source' 優先（RPC 側で解決済み） */
export interface PercoinGrantRow {
  source: string;
  grant_count: number;
  total_amount: number;
  user_count: number;
}

export interface PercoinStreakReachRow {
  streak_day: number;
  user_count: number;
}

export interface PercoinCheckinReachRow {
  signup_count: number;
  checked_in_count: number;
}

export interface PercoinBalanceDistributionRow {
  holder_count: number;
  total_balance: number;
  median_balance: number | null;
  p90_balance: number | null;
  top10_percent_share: number | null;
}

export interface PercoinGrantItem {
  source: string;
  label: string;
  totalAmount: number;
  previousAmount: number;
  /** 前期比(%)。前期が0なら null（「∞%増」を出さない） */
  changePercent: number | null;
  grantCount: number;
  userCount: number;
  /** 当期の配布総額に占める割合(%) */
  sharePercent: number;
}

export interface PercoinStreakReachItem {
  day: number;
  userCount: number;
  /** 1日目を分母にした到達率(%) */
  reachPercent: number;
  previousReachPercent: number | null;
}

export interface PercoinAnalytics {
  grants: PercoinGrantItem[];
  totalGranted: number;
  previousTotalGranted: number;
  totalChangePercent: number | null;
  streakReach: PercoinStreakReachItem[];
  /** 1日目→2日目の離脱率(%)。ここが最も落ちるので単独で出す */
  streakFirstDropPercent: number | null;
  checkin: {
    signupCount: number;
    checkedInCount: number;
    notCheckedInCount: number;
    reachPercent: number | null;
  };
  distribution: {
    holderCount: number;
    totalBalance: number;
    medianBalance: number | null;
    p90Balance: number | null;
    top10PercentShare: number | null;
  };
  operatorExcludedCount: number;
}

/**
 * 付与元の日本語ラベル。
 *
 * `daily_post` は生成方法ごとに分ける前の古い行で、いま新しく増えることはない。
 * 「(旧)」を付けないと、いまも混在して配っているように読めてしまう。
 */
const SOURCE_LABELS: Record<string, string> = {
  streak: "連続ログイン",
  daily_post_one_tap: "投稿ボーナス（ワンタップ）",
  daily_post_free: "投稿ボーナス（フリー）",
  daily_post_coordinate: "投稿ボーナス（コーデ）",
  daily_post_inspire: "投稿ボーナス（Creator Looks）",
  daily_post: "投稿ボーナス（旧・生成方法の区別なし）",
  signup_bonus: "新規登録",
  refund: "生成失敗の返金",
  collection_completion: "コレクション完走",
  prompt_use_bonus: "プロンプト利用",
  prompt_usage_reward: "クリエイター還元",
  style_usage_reward: "スタイル利用還元",
  tour_bonus: "チュートリアル完走",
  admin_bonus: "運営付与",
  referral: "招待",
  subscription: "サブスク付与",
  purchase: "購入",
};

export function labelForGrantSource(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

function changePercent(current: number, previous: number): number | null {
  // 前期が0のときの増加率は定義できない。0除算で Infinity を出さない
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function reachPercent(rows: PercoinStreakReachRow[], day: number): number | null {
  const base = rows.find((row) => row.streak_day === 1)?.user_count ?? 0;
  if (base === 0) return null;
  const target = rows.find((row) => row.streak_day === day)?.user_count ?? 0;
  return Math.round((target / base) * 1000) / 10;
}

export function buildPercoinAnalytics(input: {
  currentGrants: PercoinGrantRow[];
  previousGrants: PercoinGrantRow[];
  streakReach: PercoinStreakReachRow[];
  previousStreakReach: PercoinStreakReachRow[];
  checkinReach: PercoinCheckinReachRow | null;
  distribution: PercoinBalanceDistributionRow | null;
  operatorExcludedCount: number;
}): PercoinAnalytics {
  const previousBySource = new Map(
    input.previousGrants.map((row) => [row.source, row.total_amount])
  );

  const totalGranted = input.currentGrants.reduce(
    (sum, row) => sum + row.total_amount,
    0
  );
  const previousTotalGranted = input.previousGrants.reduce(
    (sum, row) => sum + row.total_amount,
    0
  );

  const grants: PercoinGrantItem[] = input.currentGrants
    .map((row) => {
      const previousAmount = previousBySource.get(row.source) ?? 0;
      return {
        source: row.source,
        label: labelForGrantSource(row.source),
        totalAmount: row.total_amount,
        previousAmount,
        changePercent: changePercent(row.total_amount, previousAmount),
        grantCount: row.grant_count,
        userCount: row.user_count,
        sharePercent:
          totalGranted > 0
            ? Math.round((row.total_amount / totalGranted) * 1000) / 10
            : 0,
      };
    })
    .sort((a, b) => b.totalAmount - a.totalAmount);

  const streakDays = Array.from({ length: 14 }, (_, i) => i + 1);
  const streakReach: PercoinStreakReachItem[] = streakDays.map((day) => ({
    day,
    userCount:
      input.streakReach.find((row) => row.streak_day === day)?.user_count ?? 0,
    reachPercent: reachPercent(input.streakReach, day) ?? 0,
    previousReachPercent: reachPercent(input.previousStreakReach, day),
  }));

  const day2Reach = reachPercent(input.streakReach, 2);

  const signupCount = input.checkinReach?.signup_count ?? 0;
  const checkedInCount = input.checkinReach?.checked_in_count ?? 0;

  return {
    grants,
    totalGranted,
    previousTotalGranted,
    totalChangePercent: changePercent(totalGranted, previousTotalGranted),
    streakReach,
    streakFirstDropPercent:
      day2Reach === null ? null : Math.round((100 - day2Reach) * 10) / 10,
    checkin: {
      signupCount,
      checkedInCount,
      notCheckedInCount: signupCount - checkedInCount,
      reachPercent:
        signupCount > 0
          ? Math.round((checkedInCount / signupCount) * 1000) / 10
          : null,
    },
    distribution: {
      holderCount: input.distribution?.holder_count ?? 0,
      totalBalance: input.distribution?.total_balance ?? 0,
      medianBalance: input.distribution?.median_balance ?? null,
      p90Balance: input.distribution?.p90_balance ?? null,
      top10PercentShare: input.distribution?.top10_percent_share ?? null,
    },
    operatorExcludedCount: input.operatorExcludedCount,
  };
}
