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

/**
 * 生成方法ごとの投稿ボーナス。
 *
 * 0 は「その生成方法には付与しない」を意味するため **0 を許す**
 * (`CLASSIC_BONUS_SOURCES` は最小1で、0 停止ができない)。
 * 額を 0 にすればデプロイなしでその生成方法だけ止められる、が運用の前提。
 *
 * `daily_post_inspire` は Creator Looks 用。機能自体が本番では無効だが、
 * 有効化したときに管理画面から額を入れるだけで動くよう枠だけ用意している。
 */
export const POST_BONUS_SOURCES = [
  "daily_post_one_tap",
  "daily_post_free",
  "daily_post_coordinate",
  "daily_post_inspire",
] as const;

/**
 * 日次ミッションのボーナス。
 *
 * `USAGE_REWARD_BONUS_SOURCES`(上限5)と**別枠にしている**理由:
 * あちらの上限は「還元が利用のたびに無制限に発生する」ことに由来する
 * (2アカウントで使い合うと生成のたびに残高が増えるため、X<=5 で縛る)。
 * こちらは日次テーブルの UNIQUE(user_id, jst_date) で**頻度が1日1回に締まる**ので、
 * 同じ上限は当てはまらない。ペアで組んでも増分は 1日あたり (額+還元)×2 - 20 で止まる。
 *
 * 0 は「そのミッションを止める」を意味するため 0 を許す。
 */
export const DAILY_MISSION_BONUS_SOURCES = [
  "prompt_use_daily",
] as const;

export const BONUS_SOURCES = [
  ...CLASSIC_BONUS_SOURCES,
  ...USAGE_REWARD_BONUS_SOURCES,
  ...POST_BONUS_SOURCES,
  ...DAILY_MISSION_BONUS_SOURCES,
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

export const POST_BONUS_MIN_AMOUNT = 0;
export const POST_BONUS_MAX_AMOUNT = 1000;

export const DAILY_MISSION_MIN_AMOUNT = 0;
export const DAILY_MISSION_MAX_AMOUNT = 1000;

const USAGE_REWARD_SOURCE_SET = new Set<string>(USAGE_REWARD_BONUS_SOURCES);
const POST_BONUS_SOURCE_SET = new Set<string>(POST_BONUS_SOURCES);
const DAILY_MISSION_SOURCE_SET = new Set<string>(DAILY_MISSION_BONUS_SOURCES);

/** 利用のたびに付与される還元 source か。 */
export function isUsageRewardBonusSource(source: string): boolean {
  return USAGE_REWARD_SOURCE_SET.has(source);
}

/** 日次ミッションの source か（0 を許す）。 */
export function isDailyMissionBonusSource(source: string): boolean {
  return DAILY_MISSION_SOURCE_SET.has(source);
}

/** 生成方法ごとの投稿ボーナス source か（0 を許す）。 */
export function isPostBonusSource(source: string): boolean {
  return POST_BONUS_SOURCE_SET.has(source);
}

/** 生成方法 → 投稿ボーナスの source。対象外の生成方法は null。 */
export function getPostBonusSource(generationType: string | null | undefined) {
  switch (generationType) {
    case "one_tap_style":
      return "daily_post_one_tap" as const;
    case "free":
      return "daily_post_free" as const;
    case "coordinate":
      return "daily_post_coordinate" as const;
    case "inspire":
      return "daily_post_inspire" as const;
    default:
      return null;
  }
}

/** source に応じた入力範囲(min/max とも境界を含む)。 */
export function getBonusAmountRange(source: string): {
  min: number;
  max: number;
} {
  if (isUsageRewardBonusSource(source)) {
    return { min: USAGE_REWARD_MIN_AMOUNT, max: USAGE_REWARD_MAX_AMOUNT };
  }
  if (isPostBonusSource(source)) {
    return { min: POST_BONUS_MIN_AMOUNT, max: POST_BONUS_MAX_AMOUNT };
  }
  if (isDailyMissionBonusSource(source)) {
    return { min: DAILY_MISSION_MIN_AMOUNT, max: DAILY_MISSION_MAX_AMOUNT };
  }
  return { min: CLASSIC_BONUS_MIN_AMOUNT, max: CLASSIC_BONUS_MAX_AMOUNT };
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
