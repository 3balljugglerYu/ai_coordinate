/** @jest-environment node */

jest.mock("@/lib/supabase/admin");

import { createAdminClient } from "@/lib/supabase/admin";
import {
  createStylePreset,
  deleteStylePreset,
  listPublishedStylePresets,
  reorderStylePresets,
  updateStylePreset,
} from "@/features/style-presets/lib/style-preset-repository";

const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;

describe("style-preset repository", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("createStylePreset_タイトル重複時_連番slugで保存し表示順も詰め直す", async () => {
    const from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      like: jest.fn().mockResolvedValue({
        data: [{ slug: "spring-smart-casual" }],
        error: null,
      }),
    });
    const rpc = jest.fn().mockResolvedValue({
      data: {
        id: "preset-1",
        slug: "spring-smart-casual-2",
        title: "Spring Smart Casual",
        styling_prompt: "Line 1\nLine 2",
        background_prompt: "Soft spring city background",
        thumbnail_image_url: "https://example.com/style.webp",
        thumbnail_storage_path: "style-presets/preset-1/image.webp",
        thumbnail_width: 720,
        thumbnail_height: 960,
        sort_order: 0,
        status: "published",
        created_by: "admin-1",
        updated_by: "admin-1",
        created_at: "2026-03-22T00:00:00.000Z",
        updated_at: "2026-03-22T00:00:00.000Z",
      },
      error: null,
    });

    mockCreateAdminClient.mockReturnValue({ from, rpc } as never);

    const created = await createStylePreset({
      title: "  Spring Smart Casual  ",
      stylingPrompt: "Line 1\r\nLine 2  ",
      backgroundPrompt: "  Soft spring city background\r\n  ",
      thumbnailImageUrl: "https://example.com/style.webp",
      thumbnailStoragePath: "style-presets/preset-1/image.webp",
      thumbnailWidth: 720,
      thumbnailHeight: 960,
      sortOrder: 0,
      status: "published",
      createdBy: "admin-1",
    });

    expect(rpc).toHaveBeenCalledWith(
      "create_style_preset",
      expect.objectContaining({
        p_slug: "spring-smart-casual-2",
        p_title: "Spring Smart Casual",
        p_styling_prompt: "Line 1\nLine 2",
        p_background_prompt: "Soft spring city background",
        p_thumbnail_image_url: "https://example.com/style.webp",
        p_thumbnail_storage_path: "style-presets/preset-1/image.webp",
        p_thumbnail_width: 720,
        p_thumbnail_height: 960,
        p_sort_order: 0,
        p_status: "published",
        p_created_by: "admin-1",
      })
    );
    expect(created.slug).toBe("spring-smart-casual-2");
    expect(created.sortOrder).toBe(0);
  });

  test("listPublishedStylePresets_公開データのみを公開用summaryへ変換する", async () => {
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest
        .fn()
        .mockReturnValueOnce({
          order: jest.fn().mockResolvedValue({
            data: [
              {
                id: "preset-1",
                slug: "paris-code",
                title: "PARIS CODE",
                styling_prompt: "prompt",
                background_prompt: "Paris street",
                thumbnail_image_url: "https://example.com/style.webp",
                thumbnail_storage_path: null,
                thumbnail_width: 912,
                thumbnail_height: 1173,
                sort_order: 0,
                status: "published",
                created_by: null,
                updated_by: null,
                created_at: "2026-03-22T00:00:00.000Z",
                updated_at: "2026-03-22T00:00:00.000Z",
              },
            ],
            error: null,
          }),
        }),
    };

    mockCreateAdminClient.mockReturnValue({
      from: jest.fn(() => query),
    } as never);

    const presets = await listPublishedStylePresets();

    expect(query.eq).toHaveBeenCalledWith("status", "published");
    expect(presets).toEqual([
      {
        id: "preset-1",
        title: "PARIS CODE",
        thumbnailImageUrl: "https://example.com/style.webp",
        thumbnailWidth: 912,
        thumbnailHeight: 1173,
        hasBackgroundPrompt: true,
      },
    ]);
  });

  test("reorderStylePresets_ID配列順にsortOrderを保存する", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });

    mockCreateAdminClient.mockReturnValue({ rpc } as never);

    await reorderStylePresets(["preset-1", "preset-2"], "admin-1");

    expect(rpc).toHaveBeenCalledWith("reorder_style_presets", {
      p_order: ["preset-1", "preset-2"],
      p_updated_by: "admin-1",
    });
  });

  test("updateStylePreset_既存値と入力値をマージしてRPCへ渡す", async () => {
    const from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: "preset-1",
          slug: "preset-1",
          title: "Before",
          styling_prompt: "Before prompt",
          background_prompt: null,
          thumbnail_image_url: "https://example.com/old.webp",
          thumbnail_storage_path: "style-presets/preset-1/old.webp",
          thumbnail_width: 720,
          thumbnail_height: 960,
          sort_order: 1,
          status: "draft",
          created_by: "admin-1",
          updated_by: "admin-1",
          created_at: "2026-03-22T00:00:00.000Z",
          updated_at: "2026-03-22T00:00:00.000Z",
        },
        error: null,
      }),
    });
    const rpc = jest.fn().mockResolvedValue({
      data: {
        id: "preset-1",
        slug: "preset-1",
        title: "Updated",
        styling_prompt: "Before prompt",
        background_prompt: "Soft city background",
        thumbnail_image_url: "https://example.com/old.webp",
        thumbnail_storage_path: "style-presets/preset-1/old.webp",
        thumbnail_width: 720,
        thumbnail_height: 960,
        sort_order: 2,
        status: "draft",
        created_by: "admin-1",
        updated_by: "admin-2",
        created_at: "2026-03-22T00:00:00.000Z",
        updated_at: "2026-03-22T01:00:00.000Z",
      },
      error: null,
    });

    mockCreateAdminClient.mockReturnValue({ from, rpc } as never);

    const updated = await updateStylePreset("preset-1", {
      title: " Updated ",
      backgroundPrompt: " Soft city background ",
      sortOrder: 2,
      updatedBy: "admin-2",
    });

    expect(rpc).toHaveBeenCalledWith("update_style_preset", {
      p_id: "preset-1",
      p_title: "Updated",
      p_styling_prompt: "Before prompt",
      p_background_prompt: "Soft city background",
      p_thumbnail_image_url: "https://example.com/old.webp",
      p_thumbnail_storage_path: "style-presets/preset-1/old.webp",
      p_thumbnail_width: 720,
      p_thumbnail_height: 960,
      p_sort_order: 2,
      p_status: "draft",
      p_updated_by: "admin-2",
    });
    expect(updated.sortOrder).toBe(2);
    expect(updated.updatedBy).toBe("admin-2");
  });

  test("deleteStylePreset_RPCで削除と再採番を依頼する", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });

    mockCreateAdminClient.mockReturnValue({ rpc } as never);

    await deleteStylePreset("preset-1");

    expect(rpc).toHaveBeenCalledWith("delete_style_preset_and_reorder", {
      p_id: "preset-1",
    });
  });
});
