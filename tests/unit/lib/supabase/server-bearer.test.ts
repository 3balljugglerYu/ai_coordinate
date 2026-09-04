/** @jest-environment node */

/**
 * `createClient()`(サーバー)の Bearer 経路。
 *
 * - `Authorization: Bearer <JWT>` があれば Cookie を読まず、トークンを
 *   `auth.setSession` でセッションにする(既存ルートの getUser / RLS がそのまま本人で動く)
 * - 期限切れトークンは setSession を呼ばない(リフレッシュ通信を起こさない)
 * - 非 JWT の Bearer(秘密鍵)や Bearer 無しは従来の Cookie 経路
 */

jest.mock("next/headers", () => ({
  cookies: jest.fn(),
  headers: jest.fn(),
}));

jest.mock("@supabase/ssr", () => ({
  createServerClient: jest.fn(),
}));

jest.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  },
}));

import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@/lib/supabase/server";

const headersMock = headers as jest.MockedFunction<typeof headers>;
const cookiesMock = cookies as jest.MockedFunction<typeof cookies>;
const createServerClientMock = createServerClient as jest.MockedFunction<
  typeof createServerClient
>;

function base64url(json: unknown): string {
  return Buffer.from(JSON.stringify(json))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function makeJwt(exp: number): string {
  return `${base64url({ alg: "HS256" })}.${base64url({ sub: "u1", exp })}.sig`;
}

function setRequestHeaders(values: Record<string, string>) {
  headersMock.mockResolvedValue(
    new Headers(values) as unknown as Awaited<ReturnType<typeof headers>>
  );
}

describe("createClient (server) Bearer path", () => {
  const getAllCookies = jest.fn(() => []);
  let setSession: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    cookiesMock.mockResolvedValue({
      getAll: getAllCookies,
      set: jest.fn(),
    } as unknown as Awaited<ReturnType<typeof cookies>>);
    setSession = jest.fn().mockResolvedValue({ data: {}, error: null });
    createServerClientMock.mockReturnValue({
      auth: { setSession },
    } as unknown as ReturnType<typeof createServerClient>);
  });

  test("Bearer JWT があれば Cookie を読まず setSession でセッションにする", async () => {
    const jwt = makeJwt(Math.floor(Date.now() / 1000) + 3600);
    setRequestHeaders({ authorization: `Bearer ${jwt}` });

    await createClient();

    expect(cookiesMock).not.toHaveBeenCalled();
    expect(setSession).toHaveBeenCalledWith({
      access_token: jwt,
      refresh_token: expect.any(String),
    });
    // Cookie アダプタは何も返さず何も書かない
    const options = createServerClientMock.mock.calls[0][2]!;
    expect(options.cookies.getAll()).toEqual([]);
    expect(() => options.cookies.setAll?.([])).not.toThrow();
  });

  test("期限切れの JWT は setSession を呼ばない(未認証のクライアント)", async () => {
    setRequestHeaders({
      authorization: `Bearer ${makeJwt(Math.floor(Date.now() / 1000) - 10)}`,
    });

    await createClient();

    expect(setSession).not.toHaveBeenCalled();
    expect(cookiesMock).not.toHaveBeenCalled();
  });

  test("setSession が失敗しても例外にせず未認証クライアントを返す", async () => {
    setSession.mockResolvedValue({
      data: {},
      error: { message: "invalid JWT" },
    });
    setRequestHeaders({
      authorization: `Bearer ${makeJwt(Math.floor(Date.now() / 1000) + 60)}`,
    });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    await expect(createClient()).resolves.toBeDefined();

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test("Bearer 無しは従来どおり Cookie 経路", async () => {
    setRequestHeaders({});

    await createClient();

    expect(cookiesMock).toHaveBeenCalledTimes(1);
    expect(setSession).not.toHaveBeenCalled();
    const options = createServerClientMock.mock.calls[0][2]!;
    options.cookies.getAll();
    expect(getAllCookies).toHaveBeenCalled();
  });

  test("非 JWT の Bearer(内部の秘密鍵)は Cookie 経路のまま", async () => {
    setRequestHeaders({ authorization: "Bearer cron-secret" });

    await createClient();

    expect(cookiesMock).toHaveBeenCalledTimes(1);
    expect(setSession).not.toHaveBeenCalled();
  });
});
