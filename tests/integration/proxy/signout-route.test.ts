/** @jest-environment node */

/**
 * proxy とログアウトの受け皿(POST /api/auth/signout)。
 *
 * proxy はリクエストごとに Cookie のセッションを読み、期限が近ければトークンを更新して
 * 新しい Cookie をレスポンスに載せる。ログアウトの受け皿でそれをすると、
 * 「proxy が載せた新しい認証 Cookie」と「ルートが消す認証 Cookie」が同じレスポンスに
 * 並び、順序しだいでログアウトが打ち消される。また退会予約中の利用者は /api が
 * 403 になるため、ログアウトすらできなくなる。
 * そのため、この経路(完全一致)だけは proxy が Supabase のセッションに触らず素通しする。
 */

jest.mock("@supabase/ssr", () => ({
  createServerClient: jest.fn(),
}));

jest.mock("@/lib/api-docs-auth", () => ({
  enforceApiDocsBasicAuth: jest.fn(),
}));

jest.mock("@/lib/i2i-poc-auth", () => ({
  enforceI2iPocBasicAuth: jest.fn(),
}));

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { enforceApiDocsBasicAuth } from "@/lib/api-docs-auth";
import { enforceI2iPocBasicAuth } from "@/lib/i2i-poc-auth";
import { proxy } from "@/proxy";

const COOKIE_USER_ID = "22222222-3333-4444-8555-666666666666";
const AUTH_COOKIE = "sb-example-auth-token";
const SESSION_COOKIE = `${AUTH_COOKIE}=base64-cookie-session`;

type CookieAdapter = {
  setAll: (
    cookies: Array<{ name: string; value: string; options: Record<string, unknown> }>
  ) => void;
};

function createRequest(pathname: string) {
  return new NextRequest(`http://localhost${pathname}`, {
    method: "POST",
    headers: new Headers({ cookie: SESSION_COOKIE, origin: "http://localhost" }),
  });
}

/**
 * Cookie のセッションを読むと、期限切れ間近としてトークンを更新する
 * (= 新しい認証 Cookie を setAll で書く)クライアント。
 */
function useRefreshingCookieClient({ deactivated }: { deactivated: boolean }) {
  const createServerClientMock = createServerClient as jest.MockedFunction<
    typeof createServerClient
  >;
  createServerClientMock.mockImplementation((_url, _key, options) => {
    const cookies = options.cookies as unknown as CookieAdapter;
    const maybeSingle = jest.fn().mockResolvedValue({
      data: { deactivated_at: deactivated ? "2026-09-01T00:00:00Z" : null },
      error: null,
    });
    const eq = jest.fn(() => ({ maybeSingle }));
    const select = jest.fn(() => ({ eq }));
    return {
      auth: {
        getSession: jest.fn(async () => {
          cookies.setAll([
            { name: AUTH_COOKIE, value: "base64-refreshed", options: { path: "/" } },
          ]);
          return {
            data: { session: { user: { id: COOKIE_USER_ID } } },
            error: null,
          };
        }),
        getUser: jest.fn(),
      },
      from: jest.fn(() => ({ select })),
    } as unknown as ReturnType<typeof createServerClient>;
  });
  return createServerClientMock;
}

describe("proxy: ログアウトの受け皿", () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    (enforceApiDocsBasicAuth as jest.Mock).mockReturnValue(null);
    (enforceI2iPocBasicAuth as jest.Mock).mockReturnValue(null);
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  });

  test("proxyはログアウトの受け皿でセッションを触らない", async () => {
    const createServerClientMock = useRefreshingCookieClient({ deactivated: true });

    const response = (await proxy(
      createRequest("/api/auth/signout")
    )) as NextResponse;

    // セッションを読まない(= トークンを更新しない・退会チェックもしない)
    expect(createServerClientMock).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.cookies.get(AUTH_COOKIE)).toBeUndefined();
  });

  test("ほかの /api ではトークン更新の Cookie が載る(前提の確認)", async () => {
    useRefreshingCookieClient({ deactivated: false });

    const response = (await proxy(
      createRequest("/api/posts/post")
    )) as NextResponse;

    expect(response.status).toBe(200);
    expect(response.cookies.get(AUTH_COOKIE)).toEqual(
      expect.objectContaining({ name: AUTH_COOKIE, value: "base64-refreshed" })
    );
  });

  test.each(["/api/posts/post", "/api/auth/signout-x", "/api/auth/signout/x"])(
    "受け皿以外の /api は退会予約中なら403のまま: %s",
    async (pathname) => {
      const createServerClientMock = useRefreshingCookieClient({ deactivated: true });

      const response = (await proxy(createRequest(pathname))) as NextResponse;

      expect(createServerClientMock).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: "Account is deactivated",
      });
    }
  );
});
