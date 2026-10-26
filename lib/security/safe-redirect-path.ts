/**
 * ログインのあとなどに移る先(?next= / ?redirect= / 保存した値)を、このサイトの中のパスだけにする。
 *
 * 外から渡された値をそのまま移る先にすると、よそのサイトへ移されてしまう(オープンリダイレクト)。
 * - "https://evil.com" や "//evil.com"(プロトコルを省いた URL)は、ブラウザも Next.js のルーターも、よそへ移る。
 * - "@evil.com" は、`${origin}${next}` とつなぐと "https://www.persta.ai@evil.com" になり、evil.com へ移る。
 * - "/\\evil.com" は、ブラウザが "\\" を "/" と読むので "//evil.com" と同じになる。
 * - "/..//evil.com" や "/./\\evil.com" は、URL として読み直すと "//evil.com" に縮む。
 *   ⭐ そのため、入ってきた値ではなく、読み直したあとの値で確かめる。
 * 決まりに合わない値は、fallback(既定は "/")にする。
 */
export function toSafeRedirectPath(value: string | null | undefined, fallback = "/"): string {
  if (typeof value !== "string") return fallback;
  const path = value.trim();
  if (!path.startsWith("/")) return fallback;
  if (path.startsWith("//") || path.startsWith("/\\")) return fallback;
  // 制御文字(改行・タブなど)は、ブラウザが読み飛ばして "//" になることがある
  if (/[\u0000-\u001f\u007f]/.test(path)) return fallback;
  try {
    const base = "https://persta.invalid";
    const resolved = new URL(path, base);
    if (resolved.origin !== base) return fallback;
    const normalized = `${resolved.pathname}${resolved.search}${resolved.hash}`;
    // 読み直したあとでも、プロトコルを省いた URL("//" や "/\\")になっていないこと
    if (!normalized.startsWith("/") || normalized.startsWith("//") || normalized.startsWith("/\\")) {
      return fallback;
    }
    return normalized;
  } catch {
    return fallback;
  }
}
