/**
 * 企画の贈り物(ログインした人へ1人1回、期限つきの無償ペルコインを贈る。2026-10-26 ユーザー決定)。
 *
 * - 額・受け付ける期間・期限の正本は DB の campaign_gifts(supabase/migrations/20261026120000_add_campaign_gifts.sql)。
 * - 贈った分は、ほかの無償ペルコインより期限が早いので、引き落としで必ず最初に使われる。
 * - 画面は、受け取っていない人が、どのページを開いても最初に1回だけ出す。閉じたら、その端末ではもう出さない。
 *   ログインしていない人にも出し、5回タップのあと「ログインして受け取る」にする。
 */

/** 今ある贈り物の企画(DB の campaign_gifts と同じ値) */
export const CAMPAIGN_GIFT_KEYS = ["halloween-best-shot"] as const;
export type CampaignGiftKey = (typeof CAMPAIGN_GIFT_KEYS)[number];

export const HALLOWEEN_GIFT_KEY: CampaignGiftKey = "halloween-best-shot";

export function isCampaignGiftKey(value: string): value is CampaignGiftKey {
  return (CAMPAIGN_GIFT_KEYS as readonly string[]).includes(value);
}

/** 開けるまでのタップの回数 */
export const CAMPAIGN_GIFT_TAPS_TO_OPEN = 5;

export type CampaignGiftStatus = {
  open: boolean;
  claimed: boolean;
  signedIn: boolean;
  amount: number | null;
  expireAt: string | null;
};

export type CampaignGiftClaimResult =
  | { status: "granted"; amount: number; expireAt: string }
  | { status: "already_claimed" }
  | { status: "closed" }
  /** サーバーではログインが切れていた(画面ではログイン中に見えていた) */
  | { status: "auth_required" }
  | { status: "error" };

/**
 * 贈り物の画面を出さないページ(操作の途中・ログインまわり・管理画面)。
 * 先頭の言語(/ja など)は外してから比べる。
 */
const EXCLUDED_PATH_PREFIXES = [
  "/admin",
  "/auth",
  "/login",
  "/signup",
  "/reset-password",
  "/account",
  "/credits/purchase",
] as const;

export function isCampaignGiftExcludedPath(pathWithoutLocale: string): boolean {
  return EXCLUDED_PATH_PREFIXES.some(
    (prefix) => pathWithoutLocale === prefix || pathWithoutLocale.startsWith(`${prefix}/`),
  );
}

/** 閉じた(または受け取った)ことを、この端末に残すキー。人ごと(ログインしていない人は guest)に分ける */
export function campaignGiftDismissKey(campaignKey: string, userId: string | null): string {
  return `campaign-gift-dismissed:${campaignKey}:${userId ?? "guest"}`;
}

export function readCampaignGiftDismissed(campaignKey: string, userId: string | null): boolean {
  try {
    return window.localStorage.getItem(campaignGiftDismissKey(campaignKey, userId)) === "1";
  } catch {
    return false;
  }
}

export function writeCampaignGiftDismissed(campaignKey: string, userId: string | null): void {
  try {
    window.localStorage.setItem(campaignGiftDismissKey(campaignKey, userId), "1");
  } catch {
    // 残せない端末では、次に開いたときにもう一度出る(受け取りは DB で1回だけなので害はない)
  }
}

/**
 * 贈り物の画面を出すか(状態を取ってきたあとの判定)。
 * - 受け付けの期間中で、まだ受け取っていない
 * - この端末で閉じていない
 */
export function shouldShowCampaignGift(input: {
  status: CampaignGiftStatus;
  dismissed: boolean;
}): boolean {
  return input.status.open && !input.status.claimed && !input.dismissed;
}

/** 期限の表示(例: 10月31日 23:59) */
export function formatCampaignGiftExpire(expireAt: string | null): string | null {
  if (!expireAt) return null;
  const date = new Date(expireAt);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("month")}月${get("day")}日 ${get("hour")}:${get("minute")}`;
}
