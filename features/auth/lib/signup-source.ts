export const STYLE_SIGNUP_SOURCE = "style" as const;
export const WARDROBE_SIGNUP_SOURCE = "wardrobe" as const;

/**
 * 流入元タグ。代表値は STYLE_SIGNUP_SOURCE / WARDROBE_SIGNUP_SOURCE だが、
 * X 等の外部チャネル(例: x_profile, x_post_20260627)も自由形式で受け付ける。
 * 値は parseSignupSource でサニタイズ済み(小文字英数 + _ -、1..40文字)。
 * DB 側の CHECK 制約(profiles_signup_source_check)も同じ書式。
 */
export type SignupSource = string;

/** signup_source として許可する書式(DB の CHECK と一致させること)。 */
const SIGNUP_SOURCE_PATTERN = /^[a-z0-9_-]{1,40}$/;

/**
 * 流入元タグをサニタイズして返す。トリム→小文字化し、許可文字・長さを満たせばその値、
 * 満たさなければ null。これにより外部チャネルの任意タグも安全に保存できる。
 */
export function parseSignupSource(
  value: string | null | undefined
): SignupSource | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return SIGNUP_SOURCE_PATTERN.test(normalized) ? normalized : null;
}

export function buildStyleSignupPath(nextPath = "/style"): string {
  return `/signup?${new URLSearchParams({
    next: nextPath,
    signup_source: STYLE_SIGNUP_SOURCE,
  }).toString()}`;
}

/**
 * 企画ページの既定値(fallbackSource)に添える、来た場所(SNS)の印(2026-10-16)。
 *
 * X とメタ(Instagram・Facebook)の広告を、リンクに目印(utm)を付けずに出したあとでも、
 * どこから来て登録したかを分けられるようにするため。リンクに目印があれば、そちらが優先される。
 *
 * - `x_ad`: X の広告のクリック ID(twclid)が付いている
 * - `meta`: メタのクリック ID(fbclid)が付いている／Instagram・Facebook のアプリの中で開いた／
 *   参照元がメタのサイト。fbclid は広告でないリンクにも付くので、広告かどうかは分けない
 * - `x`: X のアプリの中で開いた／参照元が X(t.co など)。広告かどうかは分けない
 */
export type SignupChannel = "x_ad" | "x" | "meta";

const X_HOSTS = ["t.co", "x.com", "twitter.com"] as const;
const META_HOSTS = ["facebook.com", "instagram.com"] as const;

function referrerHost(referrer: string): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function hostMatches(host: string, domains: readonly string[]): boolean {
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/** 着地したときの URL・ブラウザ・参照元から、来た場所を見分ける。分からなければ null。 */
export function detectSignupChannel({
  search,
  userAgent,
  referrer,
}: {
  search: string;
  userAgent: string;
  referrer: string;
}): SignupChannel | null {
  const params = new URLSearchParams(search);
  // 広告のクリックの印(各社がリンクに自動で付ける)
  if (params.has("twclid")) return "x_ad";
  if (params.has("fbclid")) return "meta";
  // アプリの中のブラウザ(WebViewBanner の見分け方と同じ。Twitter は TwitterAndroid も含む)
  if (/Twitter/i.test(userAgent)) return "x";
  if (/FBAN|FBAV|Instagram/i.test(userAgent)) return "meta";
  const host = referrerHost(referrer);
  if (host && hostMatches(host, X_HOSTS)) return "x";
  if (host && hostMatches(host, META_HOSTS)) return "meta";
  return null;
}

/** 流入元に来た場所を添える(例: halloween-best-shot_meta)。添えると書式に合わなくなるときは、元のまま。 */
export function appendSignupChannel(
  source: SignupSource,
  channel: SignupChannel | null
): SignupSource {
  if (!channel) return source;
  return parseSignupSource(`${source}_${channel}`) ?? source;
}
