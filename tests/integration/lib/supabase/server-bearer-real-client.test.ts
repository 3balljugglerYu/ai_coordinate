/** @jest-environment node */

/**
 * `createClient()` の Bearer 経路を **実際の `@supabase/ssr` / supabase-js** で確認する。
 * ネットワークは fetch スタブで差し替え、次を固定する。
 *
 * - 残り 60 秒(auth-js の EXPIRY_MARGIN_MS = 90 秒より短い)の有効 JWT でも、
 *   `auth.getUser()`(引数なし)が本人を返す
 * - `/token?grant_type=refresh_token` は一度も呼ばれない(サーバーでリフレッシュしない)
 * - PostgREST への要求はその JWT を Authorization に載せる(RLS が本人で評価される)
 * - 期限切れ JWT は通信せずに未認証(user null)になる
 */

jest.mock("next/headers", () => ({
  cookies: jest.fn(),
  headers: jest.fn(),
}));

jest.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  },
}));

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

const headersMock = headers as jest.MockedFunction<typeof headers>;

function base64url(json: unknown): string {
  return Buffer.from(JSON.stringify(json))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function makeJwt(exp: number): string {
  return `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url({
    sub: "11111111-2222-4333-8444-555555555555",
    aud: "authenticated",
    role: "authenticated",
    exp,
  })}.c2lnbmF0dXJl`;
}

interface RecordedRequest {
  url: string;
  authorization: string | null;
}

function installFetchStub(recorded: RecordedRequest[]) {
  const fetchStub = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const requestHeaders = new Headers(init?.headers);
    recorded.push({ url, authorization: requestHeaders.get("authorization") });

    if (url.includes("/auth/v1/user")) {
      return new Response(
        JSON.stringify({
          id: "11111111-2222-4333-8444-555555555555",
          aud: "authenticated",
          role: "authenticated",
          email: "app-user@example.com",
          app_metadata: {},
          user_metadata: {},
          created_at: "2026-01-01T00:00:00Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/")) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    // /token 等、想定外の要求は失敗させて検知する
    return new Response(JSON.stringify({ error: "unexpected request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  });
  return fetchStub;
}

describe("createClient (server) Bearer path with the real Supabase client", () => {
  const originalFetch = globalThis.fetch;
  let recorded: RecordedRequest[];

  beforeEach(() => {
    recorded = [];
    globalThis.fetch = installFetchStub(recorded) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("残り 60 秒の有効 JWT で getUser() が本人を返し、リフレッシュ要求を出さない", async () => {
    const jwt = makeJwt(Math.floor(Date.now() / 1000) + 60);
    headersMock.mockResolvedValue(
      new Headers({ authorization: `Bearer ${jwt}` }) as unknown as Awaited<
        ReturnType<typeof headers>
      >
    );

    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    expect(error).toBeNull();
    expect(user?.id).toBe("11111111-2222-4333-8444-555555555555");

    const userCalls = recorded.filter((r) => r.url.includes("/auth/v1/user"));
    expect(userCalls).toHaveLength(1);
    expect(userCalls[0].authorization).toBe(`Bearer ${jwt}`);
    expect(
      recorded.some((r) => r.url.includes("grant_type=refresh_token"))
    ).toBe(false);
    expect(recorded.some((r) => r.url.includes("/auth/v1/token"))).toBe(false);

    // PostgREST も同じトークンで呼ぶ(RLS が本人で評価される)
    await supabase.from("profiles").select("user_id").limit(1);
    const restCalls = recorded.filter((r) => r.url.includes("/rest/v1/profiles"));
    expect(restCalls).toHaveLength(1);
    expect(restCalls[0].authorization).toBe(`Bearer ${jwt}`);
  });

  test("期限切れ JWT は通信せずに未認証になる", async () => {
    const jwt = makeJwt(Math.floor(Date.now() / 1000) - 5);
    headersMock.mockResolvedValue(
      new Headers({ authorization: `Bearer ${jwt}` }) as unknown as Awaited<
        ReturnType<typeof headers>
      >
    );

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    expect(user).toBeNull();
    expect(recorded).toHaveLength(0);
  });
});
