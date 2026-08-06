/**
 * /admin/percoin-defaults の付与額設定に関する共有定義。
 *
 * source ごとに許容範囲が違うため、API(zod)・管理フォーム・DB CHECK の
 * 3箇所で同じ規則を使う。DB 側の CHECK は 20260806150000 にある。
 */

/** 従来の単発ボーナス。必ず1以上(0にすると「特典が無い」状態と区別できないため)。 */
export const CLASSIC_BONUS_SOURCES = [
  "signup_bonus",
  "tour_bonus",
  "referral",
  "daily_post",
] as const;

/**
 * クリエイター還元。他ユーザーの生成のたびに付与されるため、
 * 0(=付与しない) を許し、上限を小さく固定する。
 */
export const USAGE_REWARD_BONUS_SOURCES = [
  "prompt_usage_reward",
  "style_usage_reward",
] as const;

export const BONUS_SOURCES = [
  ...CLASSIC_BONUS_SOURCES,
  ...USAGE_REWARD_BONUS_SOURCES,
] as const;

export type PercoinBonusSource = (typeof BONUS_SOURCES)[number];

export const CLASSIC_BONUS_MIN_AMOUNT = 1;
export const CLASSIC_BONUS_MAX_AMOUNT = 1000;

/**
 * 還元の上限。1回の生成に最低 10 ペルコインかかるため、それより十分小さい値に制限する。
 *
 * 自己利用の除外だけでは2アカウントの相互利用を防げない。A が B のプロンプトで生成
 * (A が10払い B が X 受取)、B が A ので生成、を繰り返すとペアの収支は 2X - 20 になり、
 * X が11以上だと生成のたびに残高が増える。上限を運用注意ではなく制約として持つ。
 */
export const USAGE_REWARD_MIN_AMOUNT = 0;
export const USAGE_REWARD_MAX_AMOUNT = 5;

const USAGE_REWARD_SOURCE_SET = new Set<string>(USAGE_REWARD_BONUS_SOURCES);

/** 利用のたびに付与される還元 source か。 */
export function isUsageRewardBonusSource(source: string): boolean {
  return USAGE_REWARD_SOURCE_SET.has(source);
}

/** source に応じた入力範囲(min/max とも境界を含む)。 */
export function getBonusAmountRange(source: string): {
  min: number;
  max: number;
} {
  return isUsageRewardBonusSource(source)
    ? { min: USAGE_REWARD_MIN_AMOUNT, max: USAGE_REWARD_MAX_AMOUNT }
    : { min: CLASSIC_BONUS_MIN_AMOUNT, max: CLASSIC_BONUS_MAX_AMOUNT };
}

/**
 * 付与額が source の許容範囲に収まっているか。
 * 収まっていなければユーザー向けのエラーメッセージを返す。
 */
export function validateBonusAmount(
  source: string,
  amount: number
): string | null {
  const { min, max } = getBonusAmountRange(source);
  if (!Number.isInteger(amount) || amount < min || amount > max) {
    return `${source} は ${min}〜${max} の整数で指定してください`;
  }
  return null;
}
