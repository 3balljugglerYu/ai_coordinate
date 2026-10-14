/** @jest-environment node */

import {
  APP_OAUTH_REDIRECT_TO,
  buildAppOAuthAuthorizeUrl,
} from "@/lib/auth/app-oauth";

const SUPABASE_URL = "https://example-ref.supabase.co";
const CHALLENGE = "a".repeat(43);

function build(query: Record<string, string>) {
  return buildAppOAuthAuthorizeUrl(SUPABASE_URL, new URLSearchParams(query));
}

describe("buildAppOAuthAuthorizeUrl", () => {
  test("Supabase の authorize へ、アプリの戻り先と PKCE を付けて転送する", () => {
    const result = build({
      provider: "google",
      code_challenge: CHALLENGE,
      code_challenge_method: "s256",
    });
    expect(result.ok).toBe(true);
    const url = new URL((result as { url: string }).url);
    expect(url.origin + url.pathname).toBe(`${SUPABASE_URL}/auth/v1/authorize`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      provider: "google",
      redirect_to: APP_OAUTH_REDIRECT_TO,
      code_challenge: CHALLENGE,
      code_challenge_method: "s256",
    });
  });

  test("X(twitter)も通す。method の大文字小文字は問わない", () => {
    expect(
      build({ provider: "twitter", code_challenge: CHALLENGE, code_challenge_method: "S256" }).ok,
    ).toBe(true);
  });

  test("⭐戻り先は渡されても使わず、アプリに固定する(開いたリダイレクトにしない)", () => {
    const result = build({
      provider: "google",
      code_challenge: CHALLENGE,
      code_challenge_method: "s256",
      redirect_to: "https://evil.example/steal",
    });
    const url = new URL((result as { url: string }).url);
    expect(url.searchParams.get("redirect_to")).toBe(APP_OAUTH_REDIRECT_TO);
  });

  test("許可していない provider・形の違う challenge・plain は断る", () => {
    const invalid: Record<string, string>[] = [
      { provider: "github", code_challenge: CHALLENGE, code_challenge_method: "s256" },
      { provider: "google", code_challenge: "short", code_challenge_method: "s256" },
      { provider: "google", code_challenge: `${CHALLENGE}!`, code_challenge_method: "s256" },
      { provider: "google", code_challenge: CHALLENGE, code_challenge_method: "plain" },
      { provider: "google", code_challenge: CHALLENGE },
    ];
    for (const query of invalid) {
      expect(build(query)).toEqual({ ok: false, error: "invalid_request" });
    }
  });

  test("Supabase の URL が無ければ設定の誤り", () => {
    expect(
      buildAppOAuthAuthorizeUrl("", new URLSearchParams({ provider: "google" })),
    ).toEqual({ ok: false, error: "not_configured" });
  });
});
