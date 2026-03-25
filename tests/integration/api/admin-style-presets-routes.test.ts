/** @jest-environment node */

jest.mock("@/lib/auth");
jest.mock("@/features/style-presets/lib/style-preset-repository");
jest.mock("@/features/style-presets/lib/style-preset-storage");
jest.mock("@/features/style-presets/lib/revalidate-style-presets");

import { NextRequest, NextResponse } from "next/server";
import { GET, POST } from "@/app/api/admin/style-presets/route";
import {
  DELETE,
  PATCH,
} from "@/app/api/admin/style-presets/[id]/route";
import { POST as POST_REORDER } from "@/app/api/admin/style-presets/reorder/route";
import { requireAdmin } from "@/lib/auth";
import {
  createStylePreset,
  deleteStylePreset,
  getStylePresetForAdminById,
  listStylePresetsForAdmin,
  reorderStylePresets,
  updateStylePreset,
} from "@/features/style-presets/lib/style-preset-repository";
import {
  deleteStylePresetImage,
  uploadStylePresetImage,
} from "@/features/style-presets/lib/style-preset-storage";
import { revalidateStylePresets } from "@/features/style-presets/lib/revalidate-style-presets";

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockListStylePresetsForAdmin =
  listStylePresetsForAdmin as jest.MockedFunction<typeof listStylePresetsForAdmin>;
const mockCreateStylePreset =
  createStylePreset as jest.MockedFunction<typeof createStylePreset>;
const mockGetStylePresetForAdminById =
  getStylePresetForAdminById as jest.MockedFunction<typeof getStylePresetForAdminById>;
const mockUpdateStylePreset =
  updateStylePreset as jest.MockedFunction<typeof updateStylePreset>;
const mockDeleteStylePreset =
  deleteStylePreset as jest.MockedFunction<typeof deleteStylePreset>;
const mockReorderStylePresets =
  reorderStylePresets as jest.MockedFunction<typeof reorderStylePresets>;
const mockUploadStylePresetImage =
  uploadStylePresetImage as jest.MockedFunction<typeof uploadStylePresetImage>;
const mockDeleteStylePresetImage =
  deleteStylePresetImage as jest.MockedFunction<typeof deleteStylePresetImage>;
const mockRevalidateStylePresets =
  revalidateStylePresets as jest.MockedFunction<typeof revalidateStylePresets>;

function createFormRequest(path: string, formData: FormData, method: string) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    body: formData,
  });
}

function createJsonRequest(path: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("admin style preset routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ id: "admin-1" } as never);
    mockListStylePresetsForAdmin.mockResolvedValue([
      {
        id: "c3f48c0b-54d2-4c4d-a18c-bd358b58d3b1",
        slug: "preset-1",
        title: "Preset 1",
        stylingPrompt: "Prompt 1",
        backgroundPrompt: null,
        thumbnailImageUrl: "https://example.com/1.webp",
        thumbnailStoragePath: null,
        thumbnailWidth: 720,
        thumbnailHeight: 960,
        sortOrder: 0,
        status: "published",
        createdBy: null,
        updatedBy: null,
        createdAt: "2026-03-22T00:00:00.000Z",
        updatedAt: "2026-03-22T00:00:00.000Z",
      },
      {
        id: "a4d8859c-c8ab-4b53-9b97-d9b0e6970a2e",
        slug: "preset-2",
        title: "Preset 2",
        stylingPrompt: "Prompt 2",
        backgroundPrompt: "Prompt background 2",
        thumbnailImageUrl: "https://example.com/2.webp",
        thumbnailStoragePath: null,
        thumbnailWidth: 720,
        thumbnailHeight: 960,
        sortOrder: 1,
        status: "published",
        createdBy: null,
        updatedBy: null,
        createdAt: "2026-03-22T00:00:00.000Z",
        updatedAt: "2026-03-22T00:00:00.000Z",
      },
    ] as never);
  });

  test("getAdminStylePresets_非管理者は403を返す", async () => {
    mockRequireAdmin.mockRejectedValueOnce(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "Forbidden" });
  });

  test("postAdminStylePresets_正常入力で新規作成できる", async () => {
    const formData = new FormData();
    formData.set("title", "Spring Smart Casual");
    formData.set("styling_prompt", "Prompt body");
    formData.set("background_prompt", "Soft spring background");
    formData.set("sort_order", "3");
    formData.set("status", "published");
    formData.set(
      "file",
      new File(["image"], "style.png", { type: "image/png" })
    );

    mockUploadStylePresetImage.mockResolvedValueOnce({
      imageUrl: "https://example.com/style.webp",
      storagePath: "style-presets/preset-1/image.webp",
      width: 720,
      height: 960,
    });
    mockCreateStylePreset.mockResolvedValueOnce({
      id: "preset-1",
      slug: "spring-smart-casual",
      title: "Spring Smart Casual",
      stylingPrompt: "Prompt body",
      backgroundPrompt: "Soft spring background",
      thumbnailImageUrl: "https://example.com/style.webp",
      thumbnailStoragePath: "style-presets/preset-1/image.webp",
      thumbnailWidth: 720,
      thumbnailHeight: 960,
      sortOrder: 3,
      status: "published",
      createdBy: "admin-1",
      updatedBy: "admin-1",
      createdAt: "2026-03-22T00:00:00.000Z",
      updatedAt: "2026-03-22T00:00:00.000Z",
    });

    const response = await POST(
      createFormRequest("/api/admin/style-presets", formData, "POST")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockUploadStylePresetImage).toHaveBeenCalled();
    expect(mockCreateStylePreset).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Spring Smart Casual",
        stylingPrompt: "Prompt body",
        backgroundPrompt: "Soft spring background",
        sortOrder: 3,
        status: "published",
        createdBy: "admin-1",
      })
    );
    expect(mockRevalidateStylePresets).toHaveBeenCalled();
    expect(body.id).toBe("preset-1");
  });

  test("postAdminStylePresets_DB保存失敗時はアップロード画像をrollback削除する", async () => {
    const formData = new FormData();
    formData.set("title", "Spring Smart Casual");
    formData.set("styling_prompt", "Prompt body");
    formData.set("background_prompt", "");
    formData.set("sort_order", "3");
    formData.set("status", "published");
    formData.set(
      "file",
      new File(["image"], "style.png", { type: "image/png" })
    );

    mockUploadStylePresetImage.mockResolvedValueOnce({
      imageUrl: "https://example.com/style.webp",
      storagePath: "style-presets/preset-1/image.webp",
      width: 720,
      height: 960,
    });
    mockCreateStylePreset.mockRejectedValueOnce(new Error("db failed"));

    const response = await POST(
      createFormRequest("/api/admin/style-presets", formData, "POST")
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(mockDeleteStylePresetImage).toHaveBeenCalledWith(
      "style-presets/preset-1/image.webp"
    );
    expect(body.error).toBe("db failed");
  });

  test("patchAdminStylePreset_画像差し替え時に旧画像を削除する", async () => {
    const formData = new FormData();
    formData.set("title", "Updated Title");
    formData.set("styling_prompt", "Updated prompt");
    formData.set("background_prompt", "Updated background");
    formData.set("sort_order", "1");
    formData.set("status", "draft");
    formData.set(
      "file",
      new File(["image"], "style.png", { type: "image/png" })
    );

    mockGetStylePresetForAdminById.mockResolvedValueOnce({
      id: "preset-1",
      slug: "preset-1",
      title: "Before",
      stylingPrompt: "Before prompt",
      backgroundPrompt: null,
      thumbnailImageUrl: "https://example.com/old.webp",
      thumbnailStoragePath: "style-presets/preset-1/old.webp",
      thumbnailWidth: 720,
      thumbnailHeight: 960,
      sortOrder: 0,
      status: "published",
      createdBy: "admin-1",
      updatedBy: "admin-1",
      createdAt: "2026-03-22T00:00:00.000Z",
      updatedAt: "2026-03-22T00:00:00.000Z",
    });
    mockUploadStylePresetImage.mockResolvedValueOnce({
      imageUrl: "https://example.com/new.webp",
      storagePath: "style-presets/preset-1/new.webp",
      width: 720,
      height: 960,
    });
    mockUpdateStylePreset.mockResolvedValueOnce({
      id: "preset-1",
      slug: "preset-1",
      title: "Updated Title",
      stylingPrompt: "Updated prompt",
      backgroundPrompt: "Updated background",
      thumbnailImageUrl: "https://example.com/new.webp",
      thumbnailStoragePath: "style-presets/preset-1/new.webp",
      thumbnailWidth: 720,
      thumbnailHeight: 960,
      sortOrder: 1,
      status: "draft",
      createdBy: "admin-1",
      updatedBy: "admin-1",
      createdAt: "2026-03-22T00:00:00.000Z",
      updatedAt: "2026-03-22T01:00:00.000Z",
    });

    const response = await PATCH(
      createFormRequest("/api/admin/style-presets/preset-1", formData, "PATCH"),
      { params: Promise.resolve({ id: "preset-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockUpdateStylePreset).toHaveBeenCalledWith(
      "preset-1",
      expect.objectContaining({
        title: "Updated Title",
        stylingPrompt: "Updated prompt",
        backgroundPrompt: "Updated background",
        status: "draft",
        thumbnailImageUrl: "https://example.com/new.webp",
      })
    );
    expect(mockDeleteStylePresetImage).toHaveBeenCalledWith(
      "style-presets/preset-1/old.webp"
    );
    expect(mockRevalidateStylePresets).toHaveBeenCalled();
    expect(body.status).toBe("draft");
  });

  test("deleteAdminStylePreset_対象を削除して再検証する", async () => {
    mockGetStylePresetForAdminById.mockResolvedValueOnce({
      id: "preset-1",
      slug: "preset-1",
      title: "Before",
      stylingPrompt: "Before prompt",
      backgroundPrompt: null,
      thumbnailImageUrl: "https://example.com/old.webp",
      thumbnailStoragePath: "style-presets/preset-1/old.webp",
      thumbnailWidth: 720,
      thumbnailHeight: 960,
      sortOrder: 0,
      status: "published",
      createdBy: "admin-1",
      updatedBy: "admin-1",
      createdAt: "2026-03-22T00:00:00.000Z",
      updatedAt: "2026-03-22T00:00:00.000Z",
    });
    mockDeleteStylePreset.mockResolvedValueOnce();

    const response = await DELETE(
      new NextRequest("http://localhost/api/admin/style-presets/preset-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "preset-1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockDeleteStylePreset).toHaveBeenCalledWith("preset-1");
    expect(mockDeleteStylePresetImage).toHaveBeenCalledWith(
      "style-presets/preset-1/old.webp"
    );
    expect(mockRevalidateStylePresets).toHaveBeenCalled();
    expect(body).toEqual({ success: true });
  });

  test("postAdminStylePresetsReorder_不正payloadは400を返す", async () => {
    const response = await POST_REORDER(
      createJsonRequest("/api/admin/style-presets/reorder", {
        order: ["not-a-uuid"],
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("order は UUID 配列で指定してください");
  });

  test("postAdminStylePresetsReorder_全IDを含まないpayloadは400を返す", async () => {
    const response = await POST_REORDER(
      createJsonRequest("/api/admin/style-presets/reorder", {
        order: ["c3f48c0b-54d2-4c4d-a18c-bd358b58d3b1"],
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe(
      "order は現在の全スタイルIDを重複なく含めてください"
    );
    expect(mockReorderStylePresets).not.toHaveBeenCalled();
  });

  test("postAdminStylePresetsReorder_正常payloadで順序保存する", async () => {
    mockReorderStylePresets.mockResolvedValueOnce();

    const response = await POST_REORDER(
      createJsonRequest("/api/admin/style-presets/reorder", {
        order: [
          "c3f48c0b-54d2-4c4d-a18c-bd358b58d3b1",
          "a4d8859c-c8ab-4b53-9b97-d9b0e6970a2e",
        ],
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockReorderStylePresets).toHaveBeenCalledWith(
      [
        "c3f48c0b-54d2-4c4d-a18c-bd358b58d3b1",
        "a4d8859c-c8ab-4b53-9b97-d9b0e6970a2e",
      ],
      "admin-1"
    );
    expect(mockRevalidateStylePresets).toHaveBeenCalled();
    expect(body).toEqual({ success: true });
  });
});
