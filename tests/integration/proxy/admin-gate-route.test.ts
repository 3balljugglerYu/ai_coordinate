/** @jest-environment node */

/**
 * proxy の管理画面の関門。ページを描く前に、管理者でなければ / へ戻す。
 * (レイアウトの確認だけだと、ページのデータが応答に流れ出るため・2026-10-26)
 */

jest.mock("@supabase/ssr", () => ({
  createServerClient: jest.fn(),
}));
jest.mock("@/lib/api-docs-auth", () => ({ enforceApiDocsBasicAuth: jest.fn(() => null) }));
jest.mock("@/lib/i2i-poc-auth", () => ({ enforceI2iPocBasicAuth: jest.fn(() => null) }));
jest.mock("@/lib/env", () => {
  const actual = jest.requireActual("@/lib/env");
  return { ...actual, isFullAdmin: jest.fn() };
});

import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isFullAdmin } from "@/lib/env";
import { isAdminPagePath, proxy } from "@/proxy";

const ADMIN = "11111111-1111-4111-8111-111111111111";

const mockCreateServerClient = createServerClient as jest.MockedFunction<typeof createServerClient>;
const mockIsFullAdmin = isFullAdmin as jest.MockedFunction<typeof isFullAdmin>;

function sessionClient(userId: string | null) {
  return {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: userId ? { user: { id: userId } } : null },
        error: null,
      }),
    },
    from: jest.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
    })),
  } as unknown as ReturnType<typeof createServerClient>;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  mockIsFullAdmin.mockImplementation((id) => id === ADMIN);
});

describe("isAdminPagePath", () => {
  test.each([
    ["/admin", true],
    ["/admin/", true],
    ["/admin/users/abc", true],
    ["/administrator", false],
    ["/api/admin/users", false],
    ["/my-page", false],
  ])("%s → %s", (pathname, expected) => {
    expect(isAdminPagePath(pathname)).toBe(expected);
  });
});

describe("proxy の管理画面の関門", () => {
  test.each(["/admin", "/admin/analytics-exclusions", "/admin/style-presets/x/edit"])(
    "未ログインで %s を開くと / へ戻す",
    async (pathname) => {
      mockCreateServerClient.mockReturnValue(sessionClient(null));
      const response = await proxy(new NextRequest(`https://www.persta.ai${pathname}?tab=all`));
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://www.persta.ai/");
    },
  );

  test("管理者でない人も / へ戻す", async () => {
    mockCreateServerClient.mockReturnValue(sessionClient("22222222-2222-4222-8222-222222222222"));
    const response = await proxy(new NextRequest("https://www.persta.ai/admin"));
    expect(response.headers.get("location")).toBe("https://www.persta.ai/");
  });

  test("管理者は通す", async () => {
    mockCreateServerClient.mockReturnValue(sessionClient(ADMIN));
    const response = await proxy(new NextRequest("https://www.persta.ai/admin"));
    expect(response.headers.get("location")).toBeNull();
  });

  test("/api/admin はここでは止めない(requireAdmin が守る)", async () => {
    mockCreateServerClient.mockReturnValue(sessionClient(null));
    const response = await proxy(new NextRequest("https://www.persta.ai/api/admin/analytics-exclusions"));
    expect(response.headers.get("location")).toBeNull();
  });
});
