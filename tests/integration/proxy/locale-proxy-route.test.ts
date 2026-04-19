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
  getLocaleCookieMaxAge,
  LOCALE_COOKIE,
  LOCALE_HEADER,
} from "@/i18n/config";

type JsonRecord = Record<string, unknown>;

type SupabaseMockOptions = {
  user?: { id: string } | null;
  deactivatedAt?: string | null;
};

function createRequest(
  url: string,
  options?: {
    acceptLanguage?: string;
    cookie?: string;
  }
): NextRequest {
  const headers = new Headers();

  if (options?.acceptLanguage) {
    headers.set("accept-language", options.acceptLanguage);
  }

  if (options?.cookie) {
    headers.set("cookie", options.cookie);
  }

  return new NextRequest(url, { headers });
}

async function readJson(response: Response): Promise<JsonRecord> {
  return (await response.json()) as JsonRecord;
}

function createSupabaseMock(options: SupabaseMockOptions = {}) {
  const authGetSession = jest.fn().mockResolvedValue({
    data: {
      session: options.user ? { user: options.user } : null,
    },
    error: null,
  });
  const maybeSingle = jest.fn().mockResolvedValue({
    data:
      options.deactivatedAt === undefined
        ? null
        : { deactivated_at: options.deactivatedAt },
  });
  const eq = jest.fn(() => ({
    maybeSingle,
  }));
  const select = jest.fn(() => ({
    eq,
  }));
  const from = jest.fn((table: string) => {
    if (table !== "profiles") {
      throw new Error(`Unexpected table: ${table}`);
    }

    return {
      select,
    };
  });

  return {
    client: {
      auth: {
        getSession: authGetSession,
      },
      from,
    },
    authGetSession,
    from,
    select,
    eq,
    maybeSingle,
  };
}

function expectLocaleCookie(response: NextResponse, locale: string) {
  const localeCookie = response.cookies.get(LOCALE_COOKIE);
  expect(localeCookie).toBeDefined();
  expect(localeCookie).toMatchObject({
    value: locale,
    path: "/",
    maxAge: getLocaleCookieMaxAge(),
    sameSite: "lax",
  });
}

function getForwardedLocaleHeader(response: Response) {
  return response.headers.get(
    `x-middleware-request-${LOCALE_HEADER.toLowerCase()}`
  );
}

describe("LocaleProxyRoute integration tests from EARS specs", () => {
  const createServerClientMock =
    createServerClient as jest.MockedFunction<typeof createServerClient>;
  const enforceApiDocsBasicAuthMock =
    enforceApiDocsBasicAuth as jest.MockedFunction<typeof enforceApiDocsBasicAuth>;
  const enforceI2iPocBasicAuthMock =
    enforceI2iPocBasicAuth as jest.MockedFunction<typeof enforceI2iPocBasicAuth>;

  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
  });

  describe("LPR-001 proxy", () => {
    test("proxy_APIドキュメントBasicAuthで拒否された場合_locale処理前に短絡終了する", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      enforceApiDocsBasicAuthMock.mockReturnValue(
        NextResponse.json({ error: "basic auth required" }, { status: 401 })
      );

      // ============================================================
      // Act
      // ============================================================
      const response = await proxy(
        createRequest("http://localhost/api-docs", {
          acceptLanguage: "en-US,en;q=0.9",
        })
      );
      const body = await readJson(response);

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(401);
      expect(body).toEqual({ error: "basic auth required" });
      expect(createServerClientMock).not.toHaveBeenCalled();
    });
  });

  describe("LPR-002 proxy", () => {
    test("proxy_i2iPOCBasicAuthで拒否された場合_locale処理前に短絡終了する", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      enforceI2iPocBasicAuthMock.mockReturnValue(
        NextResponse.json({ error: "i2i auth required" }, { status: 401 })
      );

      // ============================================================
      // Act
      // ============================================================
      const response = await proxy(
        createRequest("http://localhost/i2i/sandbox", {
          acceptLanguage: "ja-JP,ja;q=0.9",
        })
      );
      const body = await readJson(response);

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(401);
      expect(body).toEqual({ error: "i2i auth required" });
      expect(createServerClientMock).not.toHaveBeenCalled();
    });
  });

  describe("LPR-004 proxy", () => {
    test("proxy_cookieLocale付きの公開パスの場合_locale付きパスへリダイレクトする", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      const request = createRequest("http://localhost/about?from=nav", {
        acceptLanguage: "en-US,en;q=0.9",
        cookie: "NEXT_LOCALE=ja",
      });

      // ============================================================
      // Act
      // ============================================================
      const response = (await proxy(request)) as NextResponse;

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "http://localhost/ja/about?from=nav"
      );
      expectLocaleCookie(response, "ja");
      expect(createServerClientMock).not.toHaveBeenCalled();
    });

    test("proxy_cookieなしの公開パスの場合_AcceptLanguage解決localeでリダイレクトする", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      const request = createRequest("http://localhost/search", {
        acceptLanguage: "ja-JP,ja;q=0.9,en;q=0.8",
      });

      // ============================================================
      // Act
      // ============================================================
      const response = (await proxy(request)) as NextResponse;

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("http://localhost/ja/search");
      expectLocaleCookie(response, "ja");
      expect(createServerClientMock).not.toHaveBeenCalled();
    });
  });

  describe("LPR-005 proxy", () => {
    test("proxy_Supabase環境変数が欠けている場合_locale情報付きで通過させる", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      process.env.NEXT_PUBLIC_SUPABASE_URL = "";
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
      const request = createRequest("http://localhost/en/about", {
        acceptLanguage: "ja-JP,ja;q=0.9",
      });

      // ============================================================
      // Act
      // ============================================================
      const response = (await proxy(request)) as NextResponse;

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(getForwardedLocaleHeader(response)).toBe("en");
      expectLocaleCookie(response, "en");
      expect(createServerClientMock).not.toHaveBeenCalled();
    });
  });

  describe("LPR-006 proxy", () => {
    test("proxy_認証済みユーザーが認証ページにいる場合_myPageへリダイレクトする", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      const supabase = createSupabaseMock({
        user: { id: "user-123" },
      });
      createServerClientMock.mockReturnValue(
        supabase.client as ReturnType<typeof createServerClient>
      );
      const request = createRequest("http://localhost/login?redirect=/challenge", {
        acceptLanguage: "en-US,en;q=0.9",
      });

      // ============================================================
      // Act
      // ============================================================
      const response = (await proxy(request)) as NextResponse;

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("http://localhost/my-page");
      expectLocaleCookie(response, "en");
      expect(supabase.authGetSession).toHaveBeenCalledTimes(1);
      expect(supabase.from).not.toHaveBeenCalled();
    });
  });

  describe("LPR-007 proxy", () => {
    test("proxy_停止状態ユーザーがAPIパスを要求した場合_403のJSONを返す", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      const supabase = createSupabaseMock({
        user: { id: "user-456" },
        deactivatedAt: "2026-03-01T00:00:00.000Z",
      });
      createServerClientMock.mockReturnValue(
        supabase.client as ReturnType<typeof createServerClient>
      );
      const request = createRequest("http://localhost/api/posts/post", {
        acceptLanguage: "en-US,en;q=0.9",
      });

      // ============================================================
      // Act
      // ============================================================
      const response = await proxy(request);
      const body = await readJson(response);

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(403);
      expect(body).toEqual({ error: "Account is deactivated" });
      expect(response.headers.get("location")).toBeNull();
      expect(supabase.from).toHaveBeenCalledWith("profiles");
    });
  });

  describe("LPR-008 proxy", () => {
    test("proxy_停止状態ユーザーが非APIパスを要求した場合_再開ページへリダイレクトする", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      const supabase = createSupabaseMock({
        user: { id: "user-789" },
        deactivatedAt: "2026-03-01T00:00:00.000Z",
      });
      createServerClientMock.mockReturnValue(
        supabase.client as ReturnType<typeof createServerClient>
      );
      const request = createRequest("http://localhost/my-page?from=nav", {
        acceptLanguage: "ja-JP,ja;q=0.9",
      });

      // ============================================================
      // Act
      // ============================================================
      const response = (await proxy(request)) as NextResponse;

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "http://localhost/account/reactivate"
      );
      expectLocaleCookie(response, "ja");
    });
  });

  describe("LPR-009 proxy", () => {
    test("proxy_未認証で保護パスの場合_redirect付きログインへリダイレクトする", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      const supabase = createSupabaseMock({
        user: null,
      });
      createServerClientMock.mockReturnValue(
        supabase.client as ReturnType<typeof createServerClient>
      );
      const request = createRequest("http://localhost/challenge", {
        acceptLanguage: "en-US,en;q=0.9",
      });

      // ============================================================
      // Act
      // ============================================================
      const response = (await proxy(request)) as NextResponse;

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "http://localhost/login?redirect=%2Fchallenge"
      );
      expectLocaleCookie(response, "en");
      expect(supabase.authGetSession).toHaveBeenCalledTimes(1);
    });
  });

  describe("LPR-010 createNextResponse", () => {
    test("createNextResponse_requestとlocaleが与えられた場合_localeHeaderとcookieを付与する", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      const supabase = createSupabaseMock({
        user: null,
      });
      createServerClientMock.mockReturnValue(
        supabase.client as ReturnType<typeof createServerClient>
      );
      const request = createRequest("http://localhost/en/about", {
        acceptLanguage: "ja-JP,ja;q=0.9",
      });

      // ============================================================
      // Act
      // ============================================================
      const response = (await proxy(request)) as NextResponse;

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("x-middleware-override-headers")).toContain(
        LOCALE_HEADER.toLowerCase()
      );
      expect(getForwardedLocaleHeader(response)).toBe("en");
      expectLocaleCookie(response, "en");
    });
  });

  describe("LPR-011 applyLocaleCookie", () => {
    test("applyLocaleCookie_responseとlocaleが与えられた場合_標準オプションでcookieを保存する", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      const request = createRequest("http://localhost/about", {
        acceptLanguage: "en-US,en;q=0.9",
      });

      // ============================================================
      // Act
      // ============================================================
      const response = (await proxy(request)) as NextResponse;

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(307);
      expectLocaleCookie(response, "en");
    });
  });
});
