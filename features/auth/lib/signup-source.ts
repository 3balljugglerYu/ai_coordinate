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
