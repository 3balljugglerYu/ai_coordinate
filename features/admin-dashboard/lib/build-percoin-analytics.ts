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
  /** その日数に到達しうるだけの日が経っている人。母数はこちらを使う */
  eligible_count: number;
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
  /** その日数に到達しうる人の数。少ないほど数字が揺れる */
  eligibleCount: number;
  /** 到達率(%)。母数0なら null（0% と区別する） */
  reachPercent: number | null;
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
    previousReachPercent: number | null;
    /** 到達率の前期からの差(ポイント)。率の差なので % ではなく pt */
    reachPointDiff: number | null;
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

/**
 * その日数の到達率。
 *
 * 母数は day1 の人数ではなく eligible_count（到達しうるだけの日が経っている人）。
 * 開始2日目の人を14日目の母数に入れると、続けているのに脱落して見える。
 * 母数0は「まだ誰も到達しうる時期に来ていない」であって 0% ではないので null。
 */
function reachPercent(rows: PercoinStreakReachRow[], day: number): number | null {
  const row = rows.find((r) => r.streak_day === day);
  if (!row || row.eligible_count === 0) return null;
  return Math.round((row.user_count / row.eligible_count) * 1000) / 10;
}

export function buildPercoinAnalytics(input: {
  currentGrants: PercoinGrantRow[];
  previousGrants: PercoinGrantRow[];
  streakReach: PercoinStreakReachRow[];
  previousStreakReach: PercoinStreakReachRow[];
  checkinReach: PercoinCheckinReachRow | null;
  previousCheckinReach: PercoinCheckinReachRow | null;
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
  const streakReach: PercoinStreakReachItem[] = streakDays.map((day) => {
    const row = input.streakReach.find((r) => r.streak_day === day);
    return {
      day,
      userCount: row?.user_count ?? 0,
      eligibleCount: row?.eligible_count ?? 0,
      // 母数0を 0% に潰さない。「継続がゼロだった」と誤読される
      reachPercent: reachPercent(input.streakReach, day),
      previousReachPercent: reachPercent(input.previousStreakReach, day),
    };
  });

  const day2Reach = reachPercent(input.streakReach, 2);

  const signupCount = input.checkinReach?.signup_count ?? 0;
  const checkedInCount = input.checkinReach?.checked_in_count ?? 0;
  const checkinReachPercent =
    signupCount > 0
      ? Math.round((checkedInCount / signupCount) * 1000) / 10
      : null;

  const previousSignupCount = input.previousCheckinReach?.signup_count ?? 0;
  const previousCheckinReachPercent =
    previousSignupCount > 0
      ? Math.round(
          ((input.previousCheckinReach?.checked_in_count ?? 0) /
            previousSignupCount) *
            1000
        ) / 10
      : null;

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
      reachPercent: checkinReachPercent,
      previousReachPercent: previousCheckinReachPercent,
      reachPointDiff:
        checkinReachPercent === null || previousCheckinReachPercent === null
          ? null
          : Math.round((checkinReachPercent - previousCheckinReachPercent) * 10) /
            10,
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
