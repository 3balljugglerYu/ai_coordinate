/**
 * 企画の贈り物(ログインした人へ1人1回、期限つきの無償ペルコインを贈る。2026-10-26 ユーザー決定)。
 *
 * - 額・受け付ける期間・期限の正本は DB の campaign_gifts(supabase/migrations/20261026120000_add_campaign_gifts.sql)。
 * - 贈った分は、ほかの無償ペルコインより期限が早いので、引き落としで必ず最初に使われる。
 * - 画面は、受け取っていない人が、どのページを開いても最初に1回だけ出す。
 *   「あとで」で閉じたら、しばらく(3時間)出さず、そのあと開いたときにまた出す(2026-10-26 ユーザー決定の「次に開いたときにまた出す」)。
 *   その端末でもう出さないのは、受け取った・もう受け取っていた・受け付けが終わっていたときだけ。
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
    // もう出さないので、「あとで」の時刻は要らない(端末に残し続けない)
    window.localStorage.removeItem(campaignGiftLaterKey(campaignKey, userId));
  } catch {
    // 残せない端末では、次に開いたときにもう一度出る(受け取りは DB で1回だけなので害はない)
  }
}

/**
 * 「あとで」で閉じたら、出さない長さ。
 * ⭐ sessionStorage(ブラウザを閉じるまで)は使わない。スマホはタブを閉じない限り残り続け(アプリを開き直しても残る)、
 *    10/31 まで二度と出ないことがあるため。時刻で決め、3時間たったら次に開いたときにまた出す。
 */
export const CAMPAIGN_GIFT_LATER_MS = 3 * 60 * 60 * 1000;

/**
 * 「あとで」で閉じた時刻を覚えるキー。人ごとに分ける(ログインしていない人は guest)。
 * v2: 外側を触っただけで閉じていた(=「あとで」扱い)ころの覚えを使わないよう、名前を変えた(2026-10-27)
 */
export function campaignGiftLaterKey(campaignKey: string, userId: string | null): string {
  return `campaign-gift-later-v2:${campaignKey}:${userId ?? "guest"}`;
}

/** 端末に残せないブラウザのための、ページを開いている間だけの控え */
const laterInMemory = new Map<string, number>();

export function __resetCampaignGiftLaterForTest() {
  laterInMemory.clear();
}

function isWithinLater(at: number | null, nowMs: number): boolean {
  return at !== null && Number.isFinite(at) && nowMs - at >= 0 && nowMs - at < CAMPAIGN_GIFT_LATER_MS;
}

/** ページの中の控えと、端末に残した時刻の、どちらかが3時間の中なら「あとで」の間(時計が戻って未来の時刻になった値は、もう片方を消さない) */
export function readCampaignGiftLater(campaignKey: string, userId: string | null, nowMs: number = Date.now()): boolean {
  const key = campaignGiftLaterKey(campaignKey, userId);
  if (isWithinLater(laterInMemory.get(key) ?? null, nowMs)) return true;
  try {
    const stored = window.localStorage.getItem(key);
    return stored !== null && isWithinLater(Number(stored), nowMs);
  } catch {
    return false;
  }
}

export function writeCampaignGiftLater(campaignKey: string, userId: string | null, nowMs: number = Date.now()): void {
  const key = campaignGiftLaterKey(campaignKey, userId);
  laterInMemory.set(key, nowMs);
  try {
    window.localStorage.setItem(key, String(nowMs));
  } catch {
    // 残せない端末では、ページを開いている間だけ控える(ページを移るたびに出し直さないように)
  }
}

/**
 * 閉じたときの覚え方。
 * - done: 受け取った・もう受け取っていた・受け付けが終わっていた → その端末でもう出さない
 * - later: 「あとで」と × → しばらく(3時間)出さない
 * - retry: 受け取れなかった・ログインし直し・ログインして受け取る → 同じページでは出し直さず、別のページを開いたら出す
 */
export type CampaignGiftCloseKind = "done" | "later" | "retry";

/**
 * 贈り物の画面を出すか(状態を取ってきたあとの判定)。
 * - 受け付けの期間中で、まだ受け取っていない
 * - この端末で、受け取り済みなどで閉じていない(dismissed)
 * - 「あとで」から、しばらくたっている(later でない)
 */
export function shouldShowCampaignGift(input: {
  status: CampaignGiftStatus;
  dismissed: boolean;
  later: boolean;
}): boolean {
  return input.status.open && !input.status.claimed && !input.dismissed && !input.later;
}

/** 期限の日付の短い表示(例: 10/31)。5回タップしたあとの説明に使う */
export function formatCampaignGiftExpireShort(expireAt: string | null): string | null {
  if (!expireAt) return null;
  const date = new Date(expireAt);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("month")}/${get("day")}`;
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
