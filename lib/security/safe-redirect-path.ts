/**
 * ログインのあとなどに移る先(?next= / ?redirect= / 保存した値)を、このサイトの中のパスだけにする。
 *
 * 外から渡された値をそのまま移る先にすると、よそのサイトへ移されてしまう(オープンリダイレクト)。
 * - "https://evil.com" や "//evil.com"(プロトコルを省いた URL)は、ブラウザも Next.js のルーターも、よそへ移る。
 * - "@evil.com" は、`${origin}${next}` とつなぐと "https://www.persta.ai@evil.com" になり、evil.com へ移る。
 * - "/\\evil.com" は、ブラウザが "\\" を "/" と読むので "//evil.com" と同じになる。
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
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}
