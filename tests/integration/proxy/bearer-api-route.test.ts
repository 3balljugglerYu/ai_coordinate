/** @jest-environment node */

/**
 * proxy の Bearer 経路(Phase 1 REQ-02)。
 *
 * Cookie セッションを持たない /api リクエストに `Authorization: Bearer <JWT>` が
 * あれば、その本人で退会チェック(profiles.deactivated_at)を行い、Cookie 経路と
 * 同じ 403 を返す。ページやページ系リダイレクトには影響しない。
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
const USER_ID = "11111111-2222-4333-8444-555555555555";

function createRequest(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(url, { headers: new Headers(headers) });
}

interface ClientMockOptions {
  deactivatedAt?: string | null;
  bearerUser?: { id: string } | null;
  bearerError?: { message: string } | null;
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
  return {
    client: {
      auth: {
        getSession: jest
          .fn()
          .mockResolvedValue({ data: { session: null }, error: null }),
        getUser,
      },
      from,
    },
    getUser,
    from,
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

  test("退会予約中の本人は Cookie 経路と同じ 403 を返す", async () => {
    const cookieClient = createClientMock({ bearerUser: { id: USER_ID } });
    const bearerClient = createClientMock({
      deactivatedAt: "2026-09-01T00:00:00Z",
    });
    createServerClientMock
      .mockReturnValueOnce(
        cookieClient.client as unknown as ReturnType<typeof createServerClient>
      )
      .mockReturnValueOnce(
        bearerClient.client as unknown as ReturnType<typeof createServerClient>
      );

    const response = (await proxy(
      createRequest("http://localhost/api/posts/post", {
        authorization: `Bearer ${JWT}`,
      })
    )) as NextResponse;

    expect(cookieClient.getUser).toHaveBeenCalledWith(JWT);
    // 2 つ目のクライアントはトークンを載せて profiles を本人として読む
    const bearerOptions = createServerClientMock.mock.calls[1][2]!;
    expect(bearerOptions.global?.headers).toEqual({
      Authorization: `Bearer ${JWT}`,
    });
    expect(bearerClient.from).toHaveBeenCalledWith("profiles");
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Account is deactivated",
    });
  });

  test("有効なアカウントはそのまま通す", async () => {
    const cookieClient = createClientMock({ bearerUser: { id: USER_ID } });
    const bearerClient = createClientMock({ deactivatedAt: null });
    createServerClientMock
      .mockReturnValueOnce(
        cookieClient.client as unknown as ReturnType<typeof createServerClient>
      )
      .mockReturnValueOnce(
        bearerClient.client as unknown as ReturnType<typeof createServerClient>
      );

    const response = (await proxy(
      createRequest("http://localhost/api/notifications", {
        authorization: `Bearer ${JWT}`,
      })
    )) as NextResponse;

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  test("無効なトークンは未認証として通す(ルート側が 401 を返す)", async () => {
    const cookieClient = createClientMock({
      bearerError: { message: "invalid JWT" },
    });
    createServerClientMock.mockReturnValue(
      cookieClient.client as unknown as ReturnType<typeof createServerClient>
    );
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    const response = (await proxy(
      createRequest("http://localhost/api/notifications", {
        authorization: `Bearer ${JWT}`,
      })
    )) as NextResponse;

    expect(response.status).toBe(200);
    expect(createServerClientMock).toHaveBeenCalledTimes(1);
    expect(cookieClient.from).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  test("非 JWT の Bearer(内部の秘密鍵)や /api 以外では本人解決をしない", async () => {
    const cookieClient = createClientMock();
    createServerClientMock.mockReturnValue(
      cookieClient.client as unknown as ReturnType<typeof createServerClient>
    );

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
  });
});
