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
const TEST_CATEGORY_ID = "category-coordinate";
const TEST_CATEGORY_ROW = {
  id: TEST_CATEGORY_ID,
  key: "coordinate",
  display_name_ja: "コーディネート",
  display_name_en: "Coordinate",
  badge_color: "#1f2937",
  badge_text_color: "#ffffff",
  skip_base_prefix: false,
  output_aspect_ratio_mode: "source",
  user_guidance_ja: null,
  user_guidance_en: null,
  show_source_image_type_control: true,
  show_background_change_control: true,
  show_generation_model_control: true,
  visibility: "public",
  is_active: true,
};

describe("style-preset repository", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("createStylePreset_タイトル重複時_連番slugで保存し表示順も詰め直す", async () => {
    const createdRow = {
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
      category_id: TEST_CATEGORY_ID,
      image_input_mode: "single",
      reference_image_url: null,
      reference_image_storage_path: null,
      reference_image_width: null,
      reference_image_height: null,
      category: TEST_CATEGORY_ROW,
      created_by: "admin-1",
      updated_by: "admin-1",
      created_at: "2026-03-22T00:00:00.000Z",
      updated_at: "2026-03-22T00:00:00.000Z",
    };
    const slugQuery = {
      select: jest.fn().mockReturnThis(),
      like: jest.fn().mockResolvedValue({
        data: [{ slug: "spring-smart-casual" }],
        error: null,
      }),
    };
    const getByIdQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: createdRow,
        error: null,
      }),
    };
    const from = jest
      .fn()
      .mockReturnValueOnce(slugQuery)
      .mockReturnValueOnce(getByIdQuery);
    const rpc = jest.fn().mockResolvedValue({
      data: createdRow,
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
                category_id: TEST_CATEGORY_ID,
                image_input_mode: "single",
                reference_image_url: null,
                reference_image_storage_path: null,
                reference_image_width: null,
                reference_image_height: null,
                category: TEST_CATEGORY_ROW,
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
        category: {
          id: TEST_CATEGORY_ID,
          key: "coordinate",
          displayNameJa: "コーディネート",
          displayNameEn: "Coordinate",
          badgeColor: "#1f2937",
          badgeTextColor: "#ffffff",
          skipBasePrefix: false,
          outputAspectRatioMode: "source",
          userGuidanceJa: null,
          userGuidanceEn: null,
          showSourceImageTypeControl: true,
          showBackgroundChangeControl: true,
          showGenerationModelControl: true,
          showUserPromptInput: false,
          visibility: "public",
          isActive: true,
        },
        imageInputMode: "single",
        dualReferenceSource: "admin",
      },
    ]);
  });

  test("listPublishedStylePresets_運営限定カテゴリは既定で除外し管理者指定では含める", async () => {
    const publicRow = {
      id: "preset-public",
      slug: "public-style",
      title: "PUBLIC STYLE",
      styling_prompt: "public prompt",
      background_prompt: null,
      thumbnail_image_url: "https://example.com/public.webp",
      thumbnail_storage_path: null,
      thumbnail_width: 512,
      thumbnail_height: 512,
      sort_order: 0,
      status: "published",
      category_id: TEST_CATEGORY_ID,
      image_input_mode: "single",
      reference_image_url: null,
      reference_image_storage_path: null,
      reference_image_width: null,
      reference_image_height: null,
      category: TEST_CATEGORY_ROW,
      created_by: null,
      updated_by: null,
      created_at: "2026-03-22T00:00:00.000Z",
      updated_at: "2026-03-22T00:00:00.000Z",
    };
    const adminOnlyRow = {
      ...publicRow,
      id: "preset-admin-only",
      slug: "chibi-style",
      title: "CHIBI STYLE",
      category_id: "category-chibi",
      category: {
        ...TEST_CATEGORY_ROW,
        id: "category-chibi",
        key: "chibi",
        display_name_ja: "ちびキャラ",
        display_name_en: "Chibi",
        visibility: "admin_only",
      },
    };
    const data = [publicRow, adminOnlyRow];
    const makeQuery = () => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest
        .fn()
        .mockReturnValueOnce({
          order: jest.fn().mockResolvedValue({ data, error: null }),
        }),
    });
    const from = jest
      .fn()
      .mockReturnValueOnce(makeQuery())
      .mockReturnValueOnce(makeQuery());

    mockCreateAdminClient.mockReturnValue({ from } as never);

    await expect(listPublishedStylePresets()).resolves.toHaveLength(1);
    const adminPresets = await listPublishedStylePresets({
      includeAdminOnly: true,
    });

    expect(adminPresets.map((preset) => preset.id)).toEqual([
      "preset-public",
      "preset-admin-only",
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
    const existingRow = {
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
      category_id: TEST_CATEGORY_ID,
      image_input_mode: "single",
      reference_image_url: null,
      reference_image_storage_path: null,
      reference_image_width: null,
      reference_image_height: null,
      category: TEST_CATEGORY_ROW,
      created_by: "admin-1",
      updated_by: "admin-1",
      created_at: "2026-03-22T00:00:00.000Z",
      updated_at: "2026-03-22T00:00:00.000Z",
    };
    const updatedRow = {
      ...existingRow,
      title: "Updated",
      background_prompt: "Soft city background",
      sort_order: 2,
      updated_by: "admin-2",
      updated_at: "2026-03-22T01:00:00.000Z",
    };
    const maybeSingle = jest
      .fn()
      .mockResolvedValueOnce({
        data: existingRow,
        error: null,
      })
      .mockResolvedValueOnce({
        data: updatedRow,
        error: null,
      });
    const from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle,
    });
    const rpc = jest.fn().mockResolvedValue({
      data: updatedRow,
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
      p_category_id: TEST_CATEGORY_ID,
      p_image_input_mode: "single",
      p_reference_image_url: null,
      p_reference_image_storage_path: null,
      p_reference_image_width: null,
      p_reference_image_height: null,
      p_dual_reference_source: "admin",
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
