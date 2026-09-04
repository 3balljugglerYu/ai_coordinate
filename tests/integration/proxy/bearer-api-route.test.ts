/** @jest-environment node */

/**
 * proxy の Bearer 経路(Phase 1 REQ-02)。
 *
 * /api リクエストに `Authorization: Bearer <JWT>` があれば、Cookie より先に・Cookie を
 * 読まずにその本人で退会チェック(profiles.deactivated_at)を行い、Cookie 経路と同じ
 * 403 を返す。トークンが無効でも Cookie にはフォールバックしない(Route Handler の
 * `createClient()` が Bearer を優先するのと本人判定を一致させる)。
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

const JWT =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEiLCJleHAiOjQxMDI0NDQ4MDB9.c2ln";
const BEARER_USER_ID = "11111111-2222-4333-8444-555555555555";
const COOKIE_USER_ID = "22222222-3333-4444-8555-666666666666";
const SESSION_COOKIE = "sb-example-auth-token=base64-cookie-session";

function createRequest(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(url, { headers: new Headers(headers) });
}

interface ClientMockOptions {
  /** profiles.deactivated_at の値。undefined なら行なし */
  deactivatedAt?: string | null;
  bearerUser?: { id: string } | null;
  bearerError?: { message: string } | null;
  cookieUser?: { id: string } | null;
}

function createClientMock(options: ClientMockOptions = {}) {
  const maybeSingle = jest.fn().mockResolvedValue({
    data:
      options.deactivatedAt === undefined
        ? null
        : { deactivated_at: options.deactivatedAt },
    error: null,
  });
  const eq = jest.fn(() => ({ maybeSingle }));
  const select = jest.fn(() => ({ eq }));
  const from = jest.fn(() => ({ select }));
  const getUser = jest.fn().mockResolvedValue({
    data: { user: options.bearerUser ?? null },
    error: options.bearerError ?? null,
  });
  const getSession = jest.fn().mockResolvedValue({
    data: {
      session: options.cookieUser ? { user: options.cookieUser } : null,
    },
    error: null,
  });
  return {
    client: { auth: { getSession, getUser }, from },
    getUser,
    getSession,
    from,
    eq,
  };
}

describe("proxy Bearer 経路 (/api)", () => {
  const createServerClientMock = createServerClient as jest.MockedFunction<
    typeof createServerClient
  >;
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

  function useClient(mock: ReturnType<typeof createClientMock>) {
    createServerClientMock.mockReturnValue(
      mock.client as unknown as ReturnType<typeof createServerClient>
    );
  }

  test("退会予約中の本人は Cookie 経路と同じ 403 を返す", async () => {
    const bearerClient = createClientMock({
      bearerUser: { id: BEARER_USER_ID },
      deactivatedAt: "2026-09-01T00:00:00Z",
    });
    useClient(bearerClient);

    const response = (await proxy(
      createRequest("http://localhost/api/posts/post", {
        authorization: `Bearer ${JWT}`,
      })
    )) as NextResponse;

    // Bearer 用クライアント 1 つだけ(Cookie 用クライアントは作らない)
    expect(createServerClientMock).toHaveBeenCalledTimes(1);
    const options = createServerClientMock.mock.calls[0][2]!;
    expect(options.global?.headers).toEqual({ Authorization: `Bearer ${JWT}` });
    expect(options.cookies.getAll()).toEqual([]);
    expect(bearerClient.getUser).toHaveBeenCalledWith(JWT);
    expect(bearerClient.getSession).not.toHaveBeenCalled();
    expect(bearerClient.from).toHaveBeenCalledWith("profiles");
    expect(bearerClient.eq).toHaveBeenCalledWith("user_id", BEARER_USER_ID);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Account is deactivated",
    });
  });

  test("有効なアカウントはそのまま通す", async () => {
    useClient(
      createClientMock({ bearerUser: { id: BEARER_USER_ID }, deactivatedAt: null })
    );

    const response = (await proxy(
      createRequest("http://localhost/api/notifications", {
        authorization: `Bearer ${JWT}`,
      })
    )) as NextResponse;

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  test("Cookie A が有効でも Bearer B が退会予約中なら 403(Bearer を優先)", async () => {
    const bearerClient = createClientMock({
      bearerUser: { id: BEARER_USER_ID },
      cookieUser: { id: COOKIE_USER_ID },
      deactivatedAt: "2026-09-01T00:00:00Z",
    });
    useClient(bearerClient);

    const response = (await proxy(
      createRequest("http://localhost/api/posts/post", {
        authorization: `Bearer ${JWT}`,
        cookie: SESSION_COOKIE,
      })
    )) as NextResponse;

    expect(bearerClient.getSession).not.toHaveBeenCalled();
    expect(bearerClient.eq).toHaveBeenCalledWith("user_id", BEARER_USER_ID);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Account is deactivated",
    });
  });

  test("Cookie A が退会予約中でも Bearer B が有効なら通す(Cookie を読まない)", async () => {
    const bearerClient = createClientMock({
      bearerUser: { id: BEARER_USER_ID },
      cookieUser: { id: COOKIE_USER_ID },
      deactivatedAt: null,
    });
    useClient(bearerClient);

    const response = (await proxy(
      createRequest("http://localhost/api/notifications", {
        authorization: `Bearer ${JWT}`,
        cookie: SESSION_COOKIE,
      })
    )) as NextResponse;

    expect(bearerClient.getSession).not.toHaveBeenCalled();
    expect(bearerClient.eq).toHaveBeenCalledWith("user_id", BEARER_USER_ID);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  test("無効な Bearer は Cookie にフォールバックせず未認証として通す(ルート側が 401)", async () => {
    const bearerClient = createClientMock({
      bearerError: { message: "invalid JWT" },
      cookieUser: { id: COOKIE_USER_ID },
    });
    useClient(bearerClient);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    const response = (await proxy(
      createRequest("http://localhost/api/notifications", {
        authorization: `Bearer ${JWT}`,
        cookie: SESSION_COOKIE,
      })
    )) as NextResponse;

    expect(createServerClientMock).toHaveBeenCalledTimes(1);
    expect(bearerClient.getSession).not.toHaveBeenCalled();
    expect(bearerClient.from).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    warn.mockRestore();
  });

  test("非 JWT の Bearer(内部の秘密鍵)や /api 以外では Cookie 経路のまま", async () => {
    const cookieClient = createClientMock();
    useClient(cookieClient);

    await proxy(
      createRequest("http://localhost/api/internal/account-purge", {
        authorization: "Bearer cron-secret",
      })
    );
    await proxy(
      createRequest("http://localhost/my-page", {
        authorization: `Bearer ${JWT}`,
      })
    );

    expect(cookieClient.getUser).not.toHaveBeenCalled();
    expect(cookieClient.getSession).toHaveBeenCalledTimes(2);
    for (const call of createServerClientMock.mock.calls) {
      expect(call[2]?.global).toBeUndefined();
    }
  });
});
