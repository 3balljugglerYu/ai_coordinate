/** @jest-environment node */

/**
 * POST /api/auth/signout — サーバー経由のログアウト(ブラウザ側が失敗したときの受け皿)。
 *
 * ここで守ること:
 *  - Supabase のログアウトを呼び、このブラウザの認証 Cookie
 *    (1本のもの・分割された .N・コード検証用)を必ず消す
 *  - Supabase 側が失敗しても Cookie は消す(このブラウザでのログアウトは完了させる)
 *  - 認証以外の Cookie(言語設定・ゲスト識別・sb- で始まる別物)には触れない
 *  - 別サイトからの POST は 403 で、何もしない
 */

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

import { NextRequest, type NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { POST } from "@/app/api/auth/signout/route";

const mockCreateClient = jest.mocked(createClient);

const AUTH_COOKIES = [
  "sb-testref-auth-token",
  "sb-testref-auth-token.0",
  "sb-testref-auth-token.1",
  "sb-testref-auth-token-code-verifier",
];
const OTHER_COOKIES = [
  "NEXT_LOCALE",
  "persta_guest_id",
  "sb-testref-other",
  // 名前の紛らわしい別物(前後に文字が付いている)
  "sb-testref-auth-tokens",
  "xsb-testref-auth-token",
];

function buildRequest(origin: string) {
  const cookie = [...AUTH_COOKIES, ...OTHER_COOKIES]
    .map((name) => `${name}=value`)
    .join("; ");
  return new NextRequest("http://localhost/api/auth/signout", {
    method: "POST",
    headers: { origin, cookie },
  });
}

function useSupabaseSignOut(signOut: jest.Mock) {
  mockCreateClient.mockResolvedValue({ auth: { signOut } } as never);
}

/** 値を空にして即時失効させていること(max-age=0 でも過去の expires でもよい) */
function expectExpired(response: NextResponse, name: string) {
  const cookie = response.cookies.get(name);
  expect(cookie).toEqual(expect.objectContaining({ name, value: "", path: "/" }));
  const expiresAt =
    cookie?.expires === undefined ? undefined : new Date(cookie.expires).getTime();
  const expiredByMaxAge = cookie?.maxAge === 0;
  const expiredByDate = expiresAt !== undefined && expiresAt <= Date.now();
  expect(expiredByMaxAge || expiredByDate).toBe(true);
}

function expectAuthCookiesCleared(response: NextResponse) {
  for (const name of AUTH_COOKIES) {
    expectExpired(response, name);
  }
  const touched = response.cookies.getAll().map((cookie) => cookie.name);
  for (const name of OTHER_COOKIES) {
    expect(touched).not.toContain(name);
  }
}

describe("POST /api/auth/signout", () => {
  beforeEach(() => {
    mockCreateClient.mockReset();
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("認証Cookieだけを消して200", async () => {
    const signOut = jest.fn().mockResolvedValue({ error: null });
    useSupabaseSignOut(signOut);

    const response = await POST(buildRequest("http://localhost"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, revoked: true });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith();
    expectAuthCookiesCleared(response);
  });

  test("Supabaseが失敗してもCookieは消す: エラーが返る", async () => {
    const signOut = jest
      .fn()
      .mockResolvedValue({ error: { message: "upstream unavailable" } });
    useSupabaseSignOut(signOut);

    const response = await POST(buildRequest("http://localhost"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, revoked: false });
    expectAuthCookiesCleared(response);
  });

  test("Supabaseが失敗してもCookieは消す: ログアウトが例外を出す", async () => {
    const signOut = jest.fn().mockRejectedValue(new TypeError("fetch failed"));
    useSupabaseSignOut(signOut);

    const response = await POST(buildRequest("http://localhost"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, revoked: false });
    expectAuthCookiesCleared(response);
  });

  test("Supabaseが失敗してもCookieは消す: クライアントを作れない", async () => {
    mockCreateClient.mockRejectedValue(new Error("env missing"));

    const response = await POST(buildRequest("http://localhost"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, revoked: false });
    expectAuthCookiesCleared(response);
  });

  test("別オリジンは403", async () => {
    const signOut = jest.fn().mockResolvedValue({ error: null });
    useSupabaseSignOut(signOut);

    const response = await POST(buildRequest("https://evil.example"));

    expect(response.status).toBe(403);
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
