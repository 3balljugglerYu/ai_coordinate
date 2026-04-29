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
import { proxy } from "@/proxy";
import { createServerClient } from "@supabase/ssr";
import { enforceApiDocsBasicAuth } from "@/lib/api-docs-auth";
import { enforceI2iPocBasicAuth } from "@/lib/i2i-poc-auth";
import { LOCALE_COOKIE } from "@/i18n/config";

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

async function readJson(response: Response): Promise<JsonRecord> {
  return (await response.json()) as JsonRecord;
}

async function summarizeResponse(response: Response) {
  const localeCookie = (response as NextResponse).cookies?.get?.(LOCALE_COOKIE);
  const contentType = response.headers.get("content-type");

  return {
    status: response.status,
    location: response.headers.get("location"),
    middlewareNext: response.headers.get("x-middleware-next"),
    localeCookie: localeCookie
      ? {
          value: localeCookie.value,
          path: localeCookie.path,
          maxAge: localeCookie.maxAge,
          sameSite: localeCookie.sameSite,
        }
      : null,
    body: contentType?.includes("application/json")
      ? await readJson(response)
      : null,
  };
}

describe("Characterization: LocaleProxyRoute", () => {
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

  test("CHAR-LOCALE-PROXY-001: api docs basic auth response short-circuits locale handling", async () => {
    enforceApiDocsBasicAuthMock.mockReturnValue(
      NextResponse.json({ error: "basic auth required" }, { status: 401 })
    );

    const response = await proxy(
      createRequest("http://localhost/api-docs", {
        acceptLanguage: "en-US,en;q=0.9",
      })
    );

    expect(await summarizeResponse(response)).toMatchInlineSnapshot(`
      {
        "body": {
          "error": "basic auth required",
        },
        "localeCookie": null,
        "location": null,
        "middlewareNext": null,
        "status": 401,
      }
    `);
    expect(createServerClientMock).not.toHaveBeenCalled();
  });

  test("CHAR-LOCALE-PROXY-002: bare public route redirects using cookie locale before accept-language", async () => {
    const response = await proxy(
      createRequest("http://localhost/about?from=nav", {
        acceptLanguage: "en-US,en;q=0.9",
        cookie: "NEXT_LOCALE=ja",
      })
    );

    expect(await summarizeResponse(response)).toMatchInlineSnapshot(`
      {
        "body": null,
        "localeCookie": {
          "maxAge": 31536000,
          "path": "/",
          "sameSite": "lax",
          "value": "ja",
        },
        "location": "http://localhost/ja/about?from=nav",
        "middlewareNext": null,
        "status": 307,
      }
    `);
    expect(createServerClientMock).not.toHaveBeenCalled();
  });

  test("CHAR-LOCALE-PROXY-003: locale-prefixed public route without Supabase env falls through with locale cookie", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";

    const response = await proxy(
      createRequest("http://localhost/en/about", {
        acceptLanguage: "ja-JP,ja;q=0.9",
      })
    );

    expect(await summarizeResponse(response)).toMatchInlineSnapshot(`
      {
        "body": null,
        "localeCookie": {
          "maxAge": 31536000,
          "path": "/",
          "sameSite": "lax",
          "value": "en",
        },
        "location": null,
        "middlewareNext": "1",
        "status": 200,
      }
    `);
    expect(createServerClientMock).not.toHaveBeenCalled();
  });

  test("CHAR-LOCALE-PROXY-004: authenticated user visiting login redirects to my-page", async () => {
    const supabase = createSupabaseMock({
      user: { id: "user-123" },
    });
    createServerClientMock.mockReturnValue(
      supabase.client as ReturnType<typeof createServerClient>
    );

    const response = await proxy(
      createRequest("http://localhost/login", {
        acceptLanguage: "en-US,en;q=0.9",
      })
    );

    expect(await summarizeResponse(response)).toMatchInlineSnapshot(`
      {
        "body": null,
        "localeCookie": {
          "maxAge": 31536000,
          "path": "/",
          "sameSite": "lax",
          "value": "ja",
        },
        "location": "http://localhost/my-page",
        "middlewareNext": null,
        "status": 307,
      }
    `);
    expect(supabase.authGetSession).toHaveBeenCalledTimes(1);
  });

  test("CHAR-LOCALE-PROXY-005: deactivated authenticated user on api route returns json 403", async () => {
    const supabase = createSupabaseMock({
      user: { id: "user-456" },
      deactivatedAt: "2026-03-01T00:00:00.000Z",
    });
    createServerClientMock.mockReturnValue(
      supabase.client as ReturnType<typeof createServerClient>
    );

    const response = await proxy(
      createRequest("http://localhost/api/posts", {
        acceptLanguage: "ja-JP,ja;q=0.9",
      })
    );

    expect(await summarizeResponse(response)).toMatchInlineSnapshot(`
      {
        "body": {
          "error": "Account is deactivated",
        },
        "localeCookie": null,
        "location": null,
        "middlewareNext": null,
        "status": 403,
      }
    `);
    expect(supabase.from).toHaveBeenCalledWith("profiles");
  });

  test("CHAR-LOCALE-PROXY-006: protected route without user redirects to login with redirect param", async () => {
    const supabase = createSupabaseMock({
      user: null,
    });
    createServerClientMock.mockReturnValue(
      supabase.client as ReturnType<typeof createServerClient>
    );

    const response = await proxy(
      createRequest("http://localhost/challenge", {
        acceptLanguage: "fr-FR,fr;q=0.9",
      })
    );

    expect(await summarizeResponse(response)).toMatchInlineSnapshot(`
      {
        "body": null,
        "localeCookie": {
          "maxAge": 31536000,
          "path": "/",
          "sameSite": "lax",
          "value": "ja",
        },
        "location": "http://localhost/login?redirect=%2Fchallenge",
        "middlewareNext": null,
        "status": 307,
      }
    `);
    expect(supabase.authGetSession).toHaveBeenCalledTimes(1);
  });
});
