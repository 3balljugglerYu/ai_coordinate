/** @jest-environment node */

jest.mock("@/lib/auth", () => ({
  getUser: jest.fn(),
}));

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/features/popup-banners/lib/popup-banner-view-repository", () => ({
  listPopupBannerViewHistory: jest.fn(),
}));

import type { NextRequest } from "next/server";
import { GET } from "@/app/api/popup-banners/view-history/route";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listPopupBannerViewHistory } from "@/features/popup-banners/lib/popup-banner-view-repository";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockListPopupBannerViewHistory =
  listPopupBannerViewHistory as jest.MockedFunction<
    typeof listPopupBannerViewHistory
  >;

function createRequest(acceptLanguage = "ja"): NextRequest {
  const request = new Request("http://localhost/api/popup-banners/view-history", {
    headers: { "accept-language": acceptLanguage },
  });

  return Object.assign(request, {
    nextUrl: new URL(request.url),
    cookies: { get: () => undefined },
  }) as NextRequest;
}

describe("GET /api/popup-banners/view-history", () => {
  const supabase = { from: jest.fn() };
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockGetUser.mockResolvedValue({ id: "user-123" } as never);
    mockCreateClient.mockResolvedValue(supabase as never);
    mockListPopupBannerViewHistory.mockResolvedValue([
      {
        popup_banner_id: "banner-1",
        action_type: "close",
        permanently_dismissed: false,
        reshow_after: "2026-04-03T00:00:00.000Z",
        updated_at: "2026-03-27T00:00:00.000Z",
      },
    ]);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test("GET_未認証の場合_401で認証必須", async () => {
    // Spec: PBVH-001
    mockGetUser.mockResolvedValue(null);

    const response = await GET(createRequest());
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(401);
    expect(body.errorCode).toBe("POPUP_BANNERS_AUTH_REQUIRED");
    expect(body.error).toBe("ログインが必要です");
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockListPopupBannerViewHistory).not.toHaveBeenCalled();
  });

  test("GET_認証済みの場合_repository結果を200で返す", async () => {
    // Spec: PBVH-002
    const response = await GET(createRequest());
    const body = (await response.json()) as unknown[];

    expect(response.status).toBe(200);
    expect(body).toEqual([
      {
        popup_banner_id: "banner-1",
        action_type: "close",
        permanently_dismissed: false,
        reshow_after: "2026-04-03T00:00:00.000Z",
        updated_at: "2026-03-27T00:00:00.000Z",
      },
    ]);
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    expect(mockListPopupBannerViewHistory).toHaveBeenCalledWith(
      supabase,
      "user-123"
    );
  });

  test("GET_repository例外時_500で履歴取得失敗", async () => {
    // Spec: PBVH-003
    mockListPopupBannerViewHistory.mockRejectedValueOnce(new Error("db failed"));

    const response = await GET(createRequest());
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(500);
    expect(body.errorCode).toBe("POPUP_BANNERS_HISTORY_FETCH_FAILED");
    expect(body.error).toBe("表示履歴の取得に失敗しました");
  });

  test("GET_client作成例外時_500で履歴取得失敗", async () => {
    // Spec: PBVH-003
    mockCreateClient.mockRejectedValueOnce(new Error("client failed"));

    const response = await GET(createRequest());
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(500);
    expect(body.errorCode).toBe("POPUP_BANNERS_HISTORY_FETCH_FAILED");
    expect(body.error).toBe("表示履歴の取得に失敗しました");
    expect(mockListPopupBannerViewHistory).not.toHaveBeenCalled();
  });
});
