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
                // クリエイター提供プロンプトの申請メタ。秘匿/moat のため公開 summary には
                // 絶対に含めてはならない(下の toEqual がそれを保証する回帰ガード)。
                submitted_by_user_id: "creator-1",
                target_providers: ["openai"],
                recommended_provider: "openai",
                submission_consents: { copyright: true, prompt_original: true },
                preview_openai_image_url:
                  "https://example.com/preview-openai.webp",
                preview_gemini_image_url: null,
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
          userPromptLabel: null,
          userPromptPlaceholder: null,
          userPromptMaxLength: null,
          visibility: "public",
          isActive: true,
          providerUserId: null,
          providerNickname: null,
          providerAvatarUrl: null,
          unlockPrerequisiteKey: null,
          progressiveBatchSize: null,
          unlockAnnouncementHeroPath: null,
          unlockAnnouncementInitialBody: null,
          unlockAnnouncementDripBody: null,
          unlockAnnouncementAccentColor: null,
          unlockAnnouncementAccentHoverColor: null,
          unlockAnnouncementTitleColor: null,
          unlockAnnouncementSoftColor: null,
        },
        imageInputMode: "single",
        dualReferenceSource: "admin",
        providerUserId: null,
        providerNickname: null,
        providerAvatarUrl: null,
      },
    ]);
  });

  test("listPublishedStylePresets_提供者(provider)埋め込みをクレジット情報へ変換する", async () => {
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnValueOnce({
        order: jest.fn().mockResolvedValue({
          data: [
            {
              id: "preset-provider",
              slug: "godly-dress-zeus",
              title: "神話ドレス_ゼウス",
              styling_prompt: "prompt",
              background_prompt: null,
              thumbnail_image_url: "https://example.com/style.webp",
              thumbnail_storage_path: null,
              thumbnail_width: 912,
              thumbnail_height: 1173,
              sort_order: 0,
              status: "published",
              category_id: "category-godly",
              image_input_mode: "single",
              reference_image_url: null,
              reference_image_storage_path: null,
              reference_image_width: null,
              reference_image_height: null,
              category: {
                ...TEST_CATEGORY_ROW,
                id: "category-godly",
                key: "godly_dress",
                provider_user_id: "user-mario",
                provider: {
                  id: "user-mario",
                  nickname: "mario335599",
                  avatar_url: "https://example.com/avatar.webp",
                },
              },
              created_by: null,
              updated_by: null,
              created_at: "2026-06-20T00:00:00.000Z",
              updated_at: "2026-06-20T00:00:00.000Z",
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

    expect(presets).toHaveLength(1);
    expect(presets[0]?.category).toEqual(
      expect.objectContaining({
        providerUserId: "user-mario",
        providerNickname: "mario335599",
        providerAvatarUrl: "https://example.com/avatar.webp",
      })
    );
  });

  test("listPublishedStylePresets_provider埋め込みが配列で返っても先頭を採用する", async () => {
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnValueOnce({
        order: jest.fn().mockResolvedValue({
          data: [
            {
              id: "preset-provider-arr",
              slug: "godly-dress-odin",
              title: "神話ドレス_オーディン",
              styling_prompt: "prompt",
              background_prompt: null,
              thumbnail_image_url: "https://example.com/style.webp",
              thumbnail_storage_path: null,
              thumbnail_width: 912,
              thumbnail_height: 1173,
              sort_order: 0,
              status: "published",
              category_id: "category-godly",
              image_input_mode: "single",
              reference_image_url: null,
              reference_image_storage_path: null,
              reference_image_width: null,
              reference_image_height: null,
              category: {
                ...TEST_CATEGORY_ROW,
                id: "category-godly",
                key: "godly_dress",
                provider_user_id: "user-mario",
                // PostgREST が to-one を配列で返すケース
                provider: [
                  {
                    id: "user-mario",
                    nickname: "mario335599",
                    avatar_url: "https://example.com/avatar.webp",
                  },
                ],
              },
              created_by: null,
              updated_by: null,
              created_at: "2026-06-20T00:00:00.000Z",
              updated_at: "2026-06-20T00:00:00.000Z",
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

    expect(presets[0]?.category).toEqual(
      expect.objectContaining({
        providerNickname: "mario335599",
        providerAvatarUrl: "https://example.com/avatar.webp",
      }),
    );
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

  test("createStylePreset_dualReferenceSource=user_upload を指定すると RPC に user_upload が渡る", async () => {
    const createdRow = {
      id: "preset-dual-user",
      slug: "dual-user-1",
      title: "Dual user upload",
      styling_prompt: "P",
      background_prompt: null,
      thumbnail_image_url: "https://example.com/t.webp",
      thumbnail_storage_path: null,
      thumbnail_width: 720,
      thumbnail_height: 960,
      sort_order: 0,
      status: "draft",
      category_id: TEST_CATEGORY_ID,
      image_input_mode: "dual",
      dual_reference_source: "user_upload",
      reference_image_url: null,
      reference_image_storage_path: null,
      reference_image_width: null,
      reference_image_height: null,
      category: TEST_CATEGORY_ROW,
      created_by: "admin-1",
      updated_by: "admin-1",
      created_at: "2026-05-30T00:00:00.000Z",
      updated_at: "2026-05-30T00:00:00.000Z",
    };
    const slugQuery = {
      select: jest.fn().mockReturnThis(),
      like: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    const getByIdQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest
        .fn()
        .mockResolvedValue({ data: createdRow, error: null }),
    };
    const from = jest
      .fn()
      .mockReturnValueOnce(slugQuery)
      .mockReturnValueOnce(getByIdQuery);
    const rpc = jest
      .fn()
      .mockResolvedValue({ data: createdRow, error: null });
    mockCreateAdminClient.mockReturnValue({ from, rpc } as never);

    await createStylePreset({
      title: "Dual user upload",
      stylingPrompt: "P",
      backgroundPrompt: null,
      thumbnailImageUrl: "https://example.com/t.webp",
      thumbnailStoragePath: null,
      thumbnailWidth: 720,
      thumbnailHeight: 960,
      sortOrder: 0,
      status: "draft",
      createdBy: "admin-1",
      imageInputMode: "dual",
      dualReferenceSource: "user_upload",
    });

    expect(rpc).toHaveBeenCalledWith(
      "create_style_preset",
      expect.objectContaining({
        p_image_input_mode: "dual",
        p_dual_reference_source: "user_upload",
      }),
    );
  });

  test("createStylePreset_dualReferenceSource 未指定時は admin がデフォルトで RPC に渡る", async () => {
    const createdRow = {
      id: "preset-dual-default",
      slug: "dual-default",
      title: "Default dual",
      styling_prompt: "P",
      background_prompt: null,
      thumbnail_image_url: "https://example.com/t.webp",
      thumbnail_storage_path: null,
      thumbnail_width: 720,
      thumbnail_height: 960,
      sort_order: 0,
      status: "draft",
      category_id: TEST_CATEGORY_ID,
      image_input_mode: "dual",
      dual_reference_source: "admin",
      reference_image_url: null,
      reference_image_storage_path: null,
      reference_image_width: null,
      reference_image_height: null,
      category: TEST_CATEGORY_ROW,
      created_by: "admin-1",
      updated_by: "admin-1",
      created_at: "2026-05-30T00:00:00.000Z",
      updated_at: "2026-05-30T00:00:00.000Z",
    };
    const slugQuery = {
      select: jest.fn().mockReturnThis(),
      like: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    const getByIdQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest
        .fn()
        .mockResolvedValue({ data: createdRow, error: null }),
    };
    const from = jest
      .fn()
      .mockReturnValueOnce(slugQuery)
      .mockReturnValueOnce(getByIdQuery);
    const rpc = jest
      .fn()
      .mockResolvedValue({ data: createdRow, error: null });
    mockCreateAdminClient.mockReturnValue({ from, rpc } as never);

    await createStylePreset({
      title: "Default dual",
      stylingPrompt: "P",
      backgroundPrompt: null,
      thumbnailImageUrl: "https://example.com/t.webp",
      thumbnailStoragePath: null,
      thumbnailWidth: 720,
      thumbnailHeight: 960,
      sortOrder: 0,
      status: "draft",
      createdBy: "admin-1",
      imageInputMode: "dual",
      // dualReferenceSource は省略
    });

    expect(rpc).toHaveBeenCalledWith(
      "create_style_preset",
      expect.objectContaining({
        p_dual_reference_source: "admin",
      }),
    );
  });

  test("updateStylePreset_dualReferenceSource 未指定時は既存値 (user_upload) を保持する", async () => {
    const existingRow = {
      id: "preset-existing",
      slug: "existing",
      title: "Existing",
      styling_prompt: "Existing prompt",
      background_prompt: null,
      thumbnail_image_url: "https://example.com/e.webp",
      thumbnail_storage_path: null,
      thumbnail_width: 720,
      thumbnail_height: 960,
      sort_order: 1,
      status: "published",
      category_id: TEST_CATEGORY_ID,
      image_input_mode: "dual",
      dual_reference_source: "user_upload",
      reference_image_url: null,
      reference_image_storage_path: null,
      reference_image_width: null,
      reference_image_height: null,
      category: TEST_CATEGORY_ROW,
      created_by: "admin-1",
      updated_by: "admin-1",
      created_at: "2026-05-30T00:00:00.000Z",
      updated_at: "2026-05-30T00:00:00.000Z",
    };
    const updatedRow = {
      ...existingRow,
      title: "Updated",
      updated_by: "admin-2",
    };
    const maybeSingle = jest
      .fn()
      .mockResolvedValueOnce({ data: existingRow, error: null })
      .mockResolvedValueOnce({ data: updatedRow, error: null });
    const from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle,
    });
    const rpc = jest
      .fn()
      .mockResolvedValue({ data: updatedRow, error: null });
    mockCreateAdminClient.mockReturnValue({ from, rpc } as never);

    await updateStylePreset("preset-existing", {
      title: "Updated",
      updatedBy: "admin-2",
    });

    expect(rpc).toHaveBeenCalledWith(
      "update_style_preset",
      expect.objectContaining({
        p_dual_reference_source: "user_upload",
      }),
    );
  });

  test("updateStylePreset_dualReferenceSource を user_upload→admin に切り替えると RPC にも反映される", async () => {
    const existingRow = {
      id: "preset-switch",
      slug: "switch",
      title: "Switch",
      styling_prompt: "P",
      background_prompt: null,
      thumbnail_image_url: "https://example.com/s.webp",
      thumbnail_storage_path: null,
      thumbnail_width: 720,
      thumbnail_height: 960,
      sort_order: 0,
      status: "draft",
      category_id: TEST_CATEGORY_ID,
      image_input_mode: "dual",
      dual_reference_source: "user_upload",
      reference_image_url: null,
      reference_image_storage_path: null,
      reference_image_width: null,
      reference_image_height: null,
      category: TEST_CATEGORY_ROW,
      created_by: "admin-1",
      updated_by: "admin-1",
      created_at: "2026-05-30T00:00:00.000Z",
      updated_at: "2026-05-30T00:00:00.000Z",
    };
    const updatedRow = { ...existingRow, dual_reference_source: "admin" };
    const maybeSingle = jest
      .fn()
      .mockResolvedValueOnce({ data: existingRow, error: null })
      .mockResolvedValueOnce({ data: updatedRow, error: null });
    const from = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle,
    });
    const rpc = jest
      .fn()
      .mockResolvedValue({ data: updatedRow, error: null });
    mockCreateAdminClient.mockReturnValue({ from, rpc } as never);

    const result = await updateStylePreset("preset-switch", {
      dualReferenceSource: "admin",
      updatedBy: "admin-2",
    });

    expect(rpc).toHaveBeenCalledWith(
      "update_style_preset",
      expect.objectContaining({
        p_dual_reference_source: "admin",
      }),
    );
    expect(result.dualReferenceSource).toBe("admin");
  });

  test("mapRowToAdmin_dual_reference_source の正規化: 未知値 / null / undefined はすべて admin に丸める", async () => {
    const rowBase = {
      id: "preset-norm",
      slug: "norm",
      title: "Norm",
      styling_prompt: "P",
      background_prompt: null,
      thumbnail_image_url: "https://example.com/n.webp",
      thumbnail_storage_path: null,
      thumbnail_width: 720,
      thumbnail_height: 960,
      sort_order: 0,
      status: "draft",
      category_id: TEST_CATEGORY_ID,
      image_input_mode: "dual",
      reference_image_url: null,
      reference_image_storage_path: null,
      reference_image_width: null,
      reference_image_height: null,
      category: TEST_CATEGORY_ROW,
      created_by: null,
      updated_by: null,
      created_at: "2026-05-30T00:00:00.000Z",
      updated_at: "2026-05-30T00:00:00.000Z",
    };

    for (const value of [null, undefined, "invalid", "Admin", ""]) {
      const updatedRow = { ...rowBase, dual_reference_source: value };
      const maybeSingle = jest
        .fn()
        .mockResolvedValueOnce({ data: updatedRow, error: null })
        .mockResolvedValueOnce({ data: updatedRow, error: null });
      const from = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle,
      });
      const rpc = jest
        .fn()
        .mockResolvedValue({ data: updatedRow, error: null });
      mockCreateAdminClient.mockReturnValue({ from, rpc } as never);

      const result = await updateStylePreset("preset-norm", {});
      expect(result.dualReferenceSource).toBe("admin");
    }

    // user_upload はそのまま通過する
    const userRow = { ...rowBase, dual_reference_source: "user_upload" };
    const maybeSingle2 = jest
      .fn()
      .mockResolvedValueOnce({ data: userRow, error: null })
      .mockResolvedValueOnce({ data: userRow, error: null });
    const from2 = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: maybeSingle2,
    });
    const rpc2 = jest.fn().mockResolvedValue({ data: userRow, error: null });
    mockCreateAdminClient.mockReturnValue({ from: from2, rpc: rpc2 } as never);

    const result = await updateStylePreset("preset-norm", {});
    expect(result.dualReferenceSource).toBe("user_upload");
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
