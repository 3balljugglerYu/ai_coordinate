/** @jest-environment node */

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
import {
  GUEST_ID_COOKIE,
  GUEST_ID_COOKIE_MAX_AGE,
  isValidGuestId,
} from "@/lib/guest-id";

const VALID_GUEST_COOKIE_ID = "11111111-2222-4333-8444-555555555555";

function createRequest(
  url: string,
  options: { cookie?: string } = {}
): NextRequest {
  const headers = new Headers();
  if (options.cookie) {
    headers.set("cookie", options.cookie);
  }
  return new NextRequest(url, { headers });
}

function createSupabaseMock() {
  const authGetSession = jest.fn().mockResolvedValue({
    data: { session: null },
    error: null,
  });
  return {
    client: {
      auth: { getSession: authGetSession },
      from: jest.fn(),
    },
  };
}

describe("proxy guest-id cookie issuance (Phase 2)", () => {
  const createServerClientMock =
    createServerClient as jest.MockedFunction<typeof createServerClient>;
  const enforceApiDocsBasicAuthMock =
    enforceApiDocsBasicAuth as jest.MockedFunction<
      typeof enforceApiDocsBasicAuth
    >;
  const enforceI2iPocBasicAuthMock =
    enforceI2iPocBasicAuth as jest.MockedFunction<typeof enforceI2iPocBasicAuth>;

  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    enforceApiDocsBasicAuthMock.mockReturnValue(null);
    enforceI2iPocBasicAuthMock.mockReturnValue(null);
    createServerClientMock.mockReturnValue(
      createSupabaseMock().client as ReturnType<typeof createServerClient>
    );
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalSupabaseAnonKey;
    Object.defineProperty(process.env, "NODE_ENV", {
      configurable: true,
      value: originalNodeEnv,
    });
  });

  test("proxy_/style への初回アクセスで persta_guest_id を発行する", async () => {
    const response = (await proxy(
      createRequest("http://localhost/style")
    )) as NextResponse;

    const cookie = response.cookies.get(GUEST_ID_COOKIE);
    expect(cookie).toBeDefined();
    expect(cookie!.value).toEqual(expect.any(String));
    expect(isValidGuestId(cookie!.value)).toBe(true);
    // セキュリティ属性
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe("lax");
    expect(cookie!.path).toBe("/");
    expect(cookie!.maxAge).toBe(GUEST_ID_COOKIE_MAX_AGE);
  });

  test("proxy_/coordinate への初回アクセスで persta_guest_id を発行する", async () => {
    const response = (await proxy(
      createRequest("http://localhost/coordinate")
    )) as NextResponse;

    const cookie = response.cookies.get(GUEST_ID_COOKIE);
    expect(cookie).toBeDefined();
    expect(isValidGuestId(cookie!.value)).toBe(true);
  });

  test("proxy_ロケールプレフィックス付き /en/style でも発行する", async () => {
    const response = (await proxy(
      createRequest("http://localhost/en/style")
    )) as NextResponse;

    const cookie = response.cookies.get(GUEST_ID_COOKIE);
    expect(cookie).toBeDefined();
    expect(isValidGuestId(cookie!.value)).toBe(true);
  });

  test("proxy_/posts 等の対象外パスでは発行しない", async () => {
    const response = (await proxy(
      createRequest("http://localhost/posts/abc")
    )) as NextResponse;

    expect(response.cookies.get(GUEST_ID_COOKIE)).toBeUndefined();
  });

  test("proxy_既存の妥当な persta_guest_id がある場合は再発行しない", async () => {
    const response = (await proxy(
      createRequest("http://localhost/style", {
        cookie: `${GUEST_ID_COOKIE}=${VALID_GUEST_COOKIE_ID}`,
      })
    )) as NextResponse;

    expect(response.cookies.get(GUEST_ID_COOKIE)).toBeUndefined();
  });

  test("proxy_不正な persta_guest_id Cookie は新しい値で再発行する", async () => {
    const response = (await proxy(
      createRequest("http://localhost/style", {
        cookie: `${GUEST_ID_COOKIE}=tampered-value`,
      })
    )) as NextResponse;

    const cookie = response.cookies.get(GUEST_ID_COOKIE);
    expect(cookie).toBeDefined();
    expect(cookie!.value).not.toBe("tampered-value");
    expect(isValidGuestId(cookie!.value)).toBe(true);
  });

  test("proxy_本番環境では Cookie に Secure 属性が付与される", async () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      configurable: true,
      value: "production",
    });

    const response = (await proxy(
      createRequest("http://localhost/style")
    )) as NextResponse;

    expect(response.cookies.get(GUEST_ID_COOKIE)?.secure).toBe(true);
  });

  test("proxy_開発環境では Secure を付けない (ローカル http で保存できるよう)", async () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      configurable: true,
      value: "development",
    });

    const response = (await proxy(
      createRequest("http://localhost/style")
    )) as NextResponse;

    expect(response.cookies.get(GUEST_ID_COOKIE)?.secure).toBe(false);
  });
});
