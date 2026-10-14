/**
 * アプリ(iOS / Android)の Google / X ログインの入口。
 *
 * アプリはログインをアプリの上に重ねたシート(iOS の ASWebAuthenticationSession)で
 * 開く。iOS はシートを開く前に「"Persta.AI" がサインインのために "<ドメイン>" を
 * 使用しようとしています」と最初に開く URL のドメインを出すので、Supabase の URL
 * (<project-ref>.supabase.co)を直接開くとプロジェクト ID が見えてしまう。
 * そこで www.persta.ai のこの入口を開き、ここから Supabase の authorize へ転送する。
 *
 * 転送先は Supabase の authorize に固定し、受け取る値も許可したものだけにする
 * (任意の URL へ飛ばせる「開いたリダイレクト」にしない)。戻り先もアプリの
 * persta://auth/oauth に固定する。PKCE の code_verifier はアプリが持ったまま。
 */

export const APP_OAUTH_REDIRECT_TO = "persta://auth/oauth";

const ALLOWED_PROVIDERS = new Set(["google", "twitter"]);
// RFC 7636: base64url の 43〜128 文字
const CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;

export type AppOAuthResult =
  | { ok: true; url: string }
  | { ok: false; error: "invalid_request" | "not_configured" };

export function buildAppOAuthAuthorizeUrl(
  supabaseUrl: string,
  params: URLSearchParams,
): AppOAuthResult {
  if (!supabaseUrl) {
    return { ok: false, error: "not_configured" };
  }
  const provider = params.get("provider") ?? "";
  const codeChallenge = params.get("code_challenge") ?? "";
  const method = (params.get("code_challenge_method") ?? "").toLowerCase();
  if (
    !ALLOWED_PROVIDERS.has(provider) ||
    !CODE_CHALLENGE_PATTERN.test(codeChallenge) ||
    method !== "s256"
  ) {
    return { ok: false, error: "invalid_request" };
  }

  const url = new URL("/auth/v1/authorize", supabaseUrl);
  url.searchParams.set("provider", provider);
  url.searchParams.set("redirect_to", APP_OAUTH_REDIRECT_TO);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "s256");
  return { ok: true, url: url.toString() };
}
