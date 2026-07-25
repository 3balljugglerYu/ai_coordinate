/** @jest-environment node */

jest.mock("next/cache", () => ({
  cacheLife: jest.fn(),
  cacheTag: jest.fn(),
}));

jest.mock("@/features/style-presets/lib/style-preset-repository", () => ({
  getPublishedStylePresetById: jest.fn(),
  getPublishedStylePresetBySlug: jest.fn(),
  listPublishedStylePresets: jest.fn(),
}));

import { cacheLife, cacheTag } from "next/cache";
import {
  getPublishedStylePreset,
  getPublishedStylePresetBySlugPublic,
  getPublishedStylePresets,
} from "@/features/style-presets/lib/get-public-style-presets";
import {
  getPublishedStylePresetById,
  getPublishedStylePresetBySlug,
  listPublishedStylePresets,
} from "@/features/style-presets/lib/style-preset-repository";

const mockCacheLife = cacheLife as jest.MockedFunction<typeof cacheLife>;
const mockCacheTag = cacheTag as jest.MockedFunction<typeof cacheTag>;
const mockGetPublishedStylePresetById =
  getPublishedStylePresetById as jest.MockedFunction<
    typeof getPublishedStylePresetById
  >;
const mockGetPublishedStylePresetBySlug =
  getPublishedStylePresetBySlug as jest.MockedFunction<
    typeof getPublishedStylePresetBySlug
  >;
const mockListPublishedStylePresets =
  listPublishedStylePresets as jest.MockedFunction<
    typeof listPublishedStylePresets
  >;

describe("get-public-style-presets", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseCategory = {
    id: "cat-1",
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
    collectionDisplayStartsAt: null,
    collectionDisplayEndsAt: null,
    isCollectionSeries: false,
    completionThreshold: null,
  } as const;

  test("getPublishedStylePresets_キャッシュタグを付けて公開一覧を返す", async () => {
    mockListPublishedStylePresets.mockResolvedValueOnce([
      {
        id: "preset-1",
        title: "PARIS CODE",
        thumbnailImageUrl: "https://example.com/style.webp",
        thumbnailWidth: 912,
        thumbnailHeight: 1173,
        hasBackgroundPrompt: true,
        category: baseCategory,
        imageInputMode: "single",
        dualReferenceSource: "admin",
      },
    ]);

    const result = await getPublishedStylePresets();

    expect(mockCacheTag).toHaveBeenCalledWith("style-presets");
    expect(mockCacheLife).toHaveBeenCalledWith("minutes");
    expect(result).toHaveLength(1);
    expect(result[0]?.hasBackgroundPrompt).toBe(true);
  });

  test("getPublishedStylePresets_管理者指定では運営限定カテゴリも取得する", async () => {
    mockListPublishedStylePresets.mockResolvedValueOnce([]);

    await getPublishedStylePresets({ includeAdminOnly: true });

    expect(mockListPublishedStylePresets).toHaveBeenCalledWith({
      includeAdminOnly: true,
    });
  });

  test("getPublishedStylePreset_ID指定で公開プリセットを返す", async () => {
    mockGetPublishedStylePresetById.mockResolvedValueOnce({
      id: "preset-1",
      title: "PARIS CODE",
      thumbnailImageUrl: "https://example.com/style.webp",
      thumbnailWidth: 912,
      thumbnailHeight: 1173,
      hasBackgroundPrompt: false,
      category: baseCategory,
      imageInputMode: "single",
      dualReferenceSource: "admin",
    });

    const result = await getPublishedStylePreset("preset-1");

    expect(mockCacheTag).toHaveBeenCalledWith("style-presets");
    expect(mockCacheLife).toHaveBeenCalledWith("minutes");
    expect(mockGetPublishedStylePresetById).toHaveBeenCalledWith("preset-1");
    expect(result?.id).toBe("preset-1");
    expect(result?.hasBackgroundPrompt).toBe(false);
  });

  test("getPublishedStylePreset_管理者指定では運営限定カテゴリも取得する", async () => {
    mockGetPublishedStylePresetById.mockResolvedValueOnce(null);

    await getPublishedStylePreset("preset-admin", { includeAdminOnly: true });

    expect(mockGetPublishedStylePresetById).toHaveBeenCalledWith(
      "preset-admin",
      { includeAdminOnly: true }
    );
  });

  test("getPublishedStylePresetBySlugPublic_slug指定で公開プリセットを返す", async () => {
    mockGetPublishedStylePresetBySlug.mockResolvedValueOnce({
      id: "preset-1",
      slug: "paris-code",
      title: "PARIS CODE",
      thumbnailImageUrl: "https://example.com/style.webp",
      thumbnailWidth: 912,
      thumbnailHeight: 1173,
      hasBackgroundPrompt: true,
      createdAt: "2026-03-22T00:00:00.000Z",
      publishedAt: null,
      category: baseCategory,
      imageInputMode: "single",
      dualReferenceSource: "admin",
    } as never);

    const result = await getPublishedStylePresetBySlugPublic("paris-code");

    expect(mockCacheTag).toHaveBeenCalledWith("style-presets");
    expect(mockCacheLife).toHaveBeenCalledWith("minutes");
    expect(mockGetPublishedStylePresetBySlug).toHaveBeenCalledWith(
      "paris-code"
    );
    expect(result?.slug).toBe("paris-code");
    expect(result?.id).toBe("preset-1");
  });

  test("getPublishedStylePresetBySlugPublic_見つからなければnullを返す", async () => {
    mockGetPublishedStylePresetBySlug.mockResolvedValueOnce(null);

    await expect(
      getPublishedStylePresetBySlugPublic("unknown-slug")
    ).resolves.toBeNull();
  });
});
