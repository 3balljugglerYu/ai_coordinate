/** @jest-environment node */

jest.mock("@/lib/auth");
jest.mock("@/features/generation/lib/webp-storage");

import { NextRequest, NextResponse } from "next/server";
import { POST } from "@/app/api/admin/generate-webp-by-id/route";
import { requireAdmin } from "@/lib/auth";
import { ensureWebPVariants } from "@/features/generation/lib/webp-storage";

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockEnsureWebPVariants = ensureWebPVariants as jest.MockedFunction<
  typeof ensureWebPVariants
>;

function createRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/generate-webp-by-id", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("admin generate-webp-by-id route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({
      id: "admin-1",
      email: "admin@example.com",
    } as never);
    mockEnsureWebPVariants.mockResolvedValue({
      status: "created",
      thumbPath: "thumb.webp",
      displayPath: "display.webp",
    });
  });

  test("POST /api/admin/generate-webp-by-id_非管理者は403を返す", async () => {
    // Spec: AGWPI-001
    mockRequireAdmin.mockRejectedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const response = await POST(createRequest({ imageId: "image-1" }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "Forbidden" });
    expect(mockEnsureWebPVariants).not.toHaveBeenCalled();
  });

  test("POST /api/admin/generate-webp-by-id_imageId未指定時は400を返す", async () => {
    // Spec: AGWPI-002
    const response = await POST(createRequest({}));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "imageId is required" });
    expect(mockEnsureWebPVariants).not.toHaveBeenCalled();
  });

  test("POST /api/admin/generate-webp-by-id_画像未検出時は404を返す", async () => {
    // Spec: AGWPI-003
    mockEnsureWebPVariants.mockResolvedValueOnce({
      status: "skipped",
      reason: "image-not-found",
    });

    const response = await POST(createRequest({ imageId: "missing-image" }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "画像が見つかりません" });
  });

  test("POST /api/admin/generate-webp-by-id_元画像情報欠損時は400を返す", async () => {
    // Spec: AGWPI-004
    mockEnsureWebPVariants.mockResolvedValueOnce({
      status: "skipped",
      reason: "missing-source",
    });

    const response = await POST(createRequest({ imageId: "image-2" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "画像URLまたはストレージパスが存在しません" });
  });

  test("POST /api/admin/generate-webp-by-id_既にvariantがある場合はskipped成功を返す", async () => {
    // Spec: AGWPI-005
    mockEnsureWebPVariants.mockResolvedValueOnce({
      status: "skipped",
      reason: "already-exists",
    });

    const response = await POST(createRequest({ imageId: "image-3" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      message: "既にWebPが生成されています",
      imageId: "image-3",
      skipped: true,
    });
  });

  test("POST /api/admin/generate-webp-by-id_variant生成成功時はpathを返す", async () => {
    // Spec: AGWPI-006
    mockEnsureWebPVariants.mockResolvedValueOnce({
      status: "created",
      thumbPath: "user-1/image_thumb.webp",
      displayPath: "user-1/image_display.webp",
    });

    const response = await POST(createRequest({ imageId: "image-4" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      imageId: "image-4",
      thumbPath: "user-1/image_thumb.webp",
      displayPath: "user-1/image_display.webp",
    });
  });
});
