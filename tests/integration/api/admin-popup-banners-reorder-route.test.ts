/** @jest-environment node */

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({
  requireAdmin: jest.fn(),
}));

jest.mock("@/features/popup-banners/lib/popup-banner-repository", () => ({
  listPopupBanners: jest.fn(),
  reorderPopupBanners: jest.fn(),
}));

import { NextRequest, NextResponse } from "next/server";
import { POST } from "@/app/api/admin/popup-banners/reorder/route";
import { requireAdmin } from "@/lib/auth";
import {
  listPopupBanners,
  reorderPopupBanners,
} from "@/features/popup-banners/lib/popup-banner-repository";

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockListPopupBanners =
  listPopupBanners as jest.MockedFunction<typeof listPopupBanners>;
const mockReorderPopupBanners =
  reorderPopupBanners as jest.MockedFunction<typeof reorderPopupBanners>;

function createRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/admin/popup-banners/reorder", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/popup-banners/reorder", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ id: "admin-1" } as never);
    mockListPopupBanners.mockResolvedValue([
      {
        id: "11111111-1111-4111-8111-111111111111",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
      },
    ] as never);
    mockReorderPopupBanners.mockResolvedValue(undefined);
  });

  test("POST_完全な並び替えならrepositoryのRPC委譲で200を返す", async () => {
    const response = await POST(
      createRequest({
        order: [
          "22222222-2222-4222-8222-222222222222",
          "11111111-1111-4111-8111-111111111111",
        ],
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(mockReorderPopupBanners).toHaveBeenCalledWith([
      "22222222-2222-4222-8222-222222222222",
      "11111111-1111-4111-8111-111111111111",
    ]);
  });

  test("POST_現在の全IDを重複なく含まない場合_400を返す", async () => {
    const response = await POST(
      createRequest({
        order: ["11111111-1111-4111-8111-111111111111"],
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe(
      "order は現在の全ポップアップバナーIDを重複なく含めてください"
    );
    expect(mockReorderPopupBanners).not.toHaveBeenCalled();
  });

  test("POST_管理者認証失敗時_認可レスポンスを返す", async () => {
    mockRequireAdmin.mockRejectedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const response = await POST(
      createRequest({
        order: [
          "22222222-2222-4222-8222-222222222222",
          "11111111-1111-4111-8111-111111111111",
        ],
      })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "Forbidden" });
    expect(mockListPopupBanners).not.toHaveBeenCalled();
    expect(mockReorderPopupBanners).not.toHaveBeenCalled();
  });
});
