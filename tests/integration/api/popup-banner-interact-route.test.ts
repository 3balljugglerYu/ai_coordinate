/** @jest-environment node */

jest.mock("@/lib/auth", () => ({
  getUser: jest.fn(),
}));

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

import type { NextRequest } from "next/server";
import { POST } from "@/app/api/popup-banners/interact/route";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;

const bannerId = "11111111-1111-4111-8111-111111111111";

function createRequest(
  body: unknown,
  acceptLanguage = "ja"
): NextRequest {
  const request = new Request("http://localhost/api/popup-banners/interact", {
    method: "POST",
    headers: {
      "accept-language": acceptLanguage,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return Object.assign(request, {
    nextUrl: new URL(request.url),
    cookies: { get: () => undefined },
  }) as NextRequest;
}

describe("POST /api/popup-banners/interact", () => {
  let rpcMock: jest.Mock;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    rpcMock = jest.fn().mockResolvedValue({ error: null });
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockGetUser.mockResolvedValue({ id: "user-123" } as never);
    mockCreateAdminClient.mockReturnValue({ rpc: rpcMock } as never);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test("POST_不正リクエストの場合_400でinvalidRequest", async () => {
    // Spec: PBIR-001
    const response = await POST(
      createRequest({ banner_id: "invalid-id", action_type: "click" })
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("POPUP_BANNERS_INVALID_REQUEST");
    expect(body.error).toBe("リクエストが不正です");
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  test("POST_認証済みユーザーの場合_RPCへuserId付きで委譲する", async () => {
    // Spec: PBIR-002
    const response = await POST(
      createRequest({ banner_id: bannerId, action_type: "click" })
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(rpcMock).toHaveBeenCalledWith("record_popup_banner_interaction", {
      p_banner_id: bannerId,
      p_user_id: "user-123",
      p_action_type: "click",
    });
  });

  test("POST_未認証でも有効リクエストならuserIdをnullでRPC委譲する", async () => {
    // Spec: PBIR-003
    mockGetUser.mockResolvedValue(null);

    const response = await POST(
      createRequest({ banner_id: bannerId, action_type: "impression" })
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(rpcMock).toHaveBeenCalledWith("record_popup_banner_interaction", {
      p_banner_id: bannerId,
      p_user_id: null,
      p_action_type: "impression",
    });
  });

  test("POST_dismissForever非対応エラーの場合_400でforbidden", async () => {
    // Spec: PBIR-004
    rpcMock.mockResolvedValue({
      error: { message: "dismiss_forever is only allowed when show_once_only is true" },
    });

    const response = await POST(
      createRequest({ banner_id: bannerId, action_type: "dismiss_forever" })
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("POPUP_BANNERS_DISMISS_FOREVER_FORBIDDEN");
    expect(body.error).toBe(
      "このバナーは「次回から表示しない」に対応していません"
    );
  });

  test("POST_対象バナー未検出エラーの場合_404を返す", async () => {
    // Spec: PBIR-005
    rpcMock.mockResolvedValue({
      error: { message: "Popup banner not found" },
    });

    const response = await POST(
      createRequest({ banner_id: bannerId, action_type: "close" })
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(404);
    expect(body.errorCode).toBe("POPUP_BANNERS_NOT_FOUND");
    expect(body.error).toBe("ポップアップバナーが見つかりません");
  });

  test("POST_RPCがinvalidActionを返した場合_400を返す", async () => {
    // Spec: PBIR-006
    rpcMock.mockResolvedValue({
      error: { message: "Invalid popup banner action type" },
    });

    const response = await POST(
      createRequest({ banner_id: bannerId, action_type: "close" })
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("POPUP_BANNERS_INVALID_ACTION");
    expect(body.error).toBe("不正な操作種別です");
  });

  test("POST_RPCが未知エラーを返した場合_500を返す", async () => {
    // Spec: PBIR-007
    rpcMock.mockResolvedValue({
      error: { message: "unexpected failure" },
    });

    const response = await POST(
      createRequest({ banner_id: bannerId, action_type: "close" })
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(500);
    expect(body.errorCode).toBe("POPUP_BANNERS_INTERACT_FAILED");
    expect(body.error).toBe("ポップアップ操作の記録に失敗しました");
  });

  test("POST_例外送出時_500でinteractFailed", async () => {
    // Spec: PBIR-008
    mockGetUser.mockRejectedValue(new Error("boom"));

    const response = await POST(
      createRequest({ banner_id: bannerId, action_type: "click" })
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(500);
    expect(body.errorCode).toBe("POPUP_BANNERS_INTERACT_FAILED");
    expect(body.error).toBe("ポップアップ操作の記録に失敗しました");
  });
});
