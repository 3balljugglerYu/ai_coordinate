/** @jest-environment node */

/**
 * `createClient()`(サーバー)の Bearer 経路。
 *
 * - `Authorization: Bearer <JWT>` があれば Cookie を読まず、トークンを
 *   `global.headers.Authorization` に載せたクライアントを返す(セッションは保存しない)
 * - 期限切れトークンはヘッダー無し(= 未認証)のクライアントにする
 * - 非 JWT の Bearer(秘密鍵)や Bearer 無しは従来の Cookie 経路
 *
 * 実クライアントでの通信内容(リフレッシュ要求が起きないこと)は
 * tests/integration/lib/supabase/server-bearer-real-client.test.ts で確認する。
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
    setSession = jest.fn();
    createServerClientMock.mockReturnValue({
      auth: { setSession },
    } as unknown as ReturnType<typeof createServerClient>);
  });

  test("Bearer JWT があれば Cookie を読まず、トークンをヘッダーに載せたクライアントを返す", async () => {
    const jwt = makeJwt(Math.floor(Date.now() / 1000) + 3600);
    setRequestHeaders({ authorization: `Bearer ${jwt}` });

    await createClient();

    expect(cookiesMock).not.toHaveBeenCalled();
    expect(createServerClientMock).toHaveBeenCalledTimes(1);
    const options = createServerClientMock.mock.calls[0][2]!;
    expect(options.global?.headers).toEqual({ Authorization: `Bearer ${jwt}` });
    // セッションは保存しない(サーバーでリフレッシュが起きない)
    expect(setSession).not.toHaveBeenCalled();
    // Cookie アダプタは何も返さず何も書かない
    expect(options.cookies.getAll()).toEqual([]);
    expect(() => options.cookies.setAll?.([])).not.toThrow();
  });

  test("期限切れの JWT はヘッダーを付けない未認証クライアントにする", async () => {
    setRequestHeaders({
      authorization: `Bearer ${makeJwt(Math.floor(Date.now() / 1000) - 10)}`,
    });

    await createClient();

    expect(cookiesMock).not.toHaveBeenCalled();
    const options = createServerClientMock.mock.calls[0][2]!;
    expect(options.global).toBeUndefined();
    expect(setSession).not.toHaveBeenCalled();
  });

  test("Bearer 無しは従来どおり Cookie 経路", async () => {
    setRequestHeaders({});

    await createClient();

    expect(cookiesMock).toHaveBeenCalledTimes(1);
    const options = createServerClientMock.mock.calls[0][2]!;
    expect(options.global).toBeUndefined();
    options.cookies.getAll();
    expect(getAllCookies).toHaveBeenCalled();
  });

  test("非 JWT の Bearer(内部の秘密鍵)は Cookie 経路のまま", async () => {
    setRequestHeaders({ authorization: "Bearer cron-secret" });

    await createClient();

    expect(cookiesMock).toHaveBeenCalledTimes(1);
    const options = createServerClientMock.mock.calls[0][2]!;
    expect(options.global).toBeUndefined();
  });
});
