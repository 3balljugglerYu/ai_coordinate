/** @jest-environment node */

jest.mock("next/cache", () => ({
  cacheLife: jest.fn(),
  cacheTag: jest.fn(),
}));

jest.mock("@/features/style-presets/lib/style-preset-repository", () => ({
  getPublishedStylePresetById: jest.fn(),
  listPublishedStylePresets: jest.fn(),
}));

import { cacheLife, cacheTag } from "next/cache";
import {
  getPublishedStylePreset,
  getPublishedStylePresets,
} from "@/features/style-presets/lib/get-public-style-presets";
import {
  getPublishedStylePresetById,
  listPublishedStylePresets,
} from "@/features/style-presets/lib/style-preset-repository";

const mockCacheLife = cacheLife as jest.MockedFunction<typeof cacheLife>;
const mockCacheTag = cacheTag as jest.MockedFunction<typeof cacheTag>;
const mockGetPublishedStylePresetById =
  getPublishedStylePresetById as jest.MockedFunction<
    typeof getPublishedStylePresetById
  >;
const mockListPublishedStylePresets =
  listPublishedStylePresets as jest.MockedFunction<
    typeof listPublishedStylePresets
  >;

describe("get-public-style-presets", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("getPublishedStylePresets_キャッシュタグを付けて公開一覧を返す", async () => {
    mockListPublishedStylePresets.mockResolvedValueOnce([
      {
        id: "preset-1",
        title: "PARIS CODE",
        thumbnailImageUrl: "https://example.com/style.webp",
        thumbnailWidth: 912,
        thumbnailHeight: 1173,
      },
    ]);

    const result = await getPublishedStylePresets();

    expect(mockCacheTag).toHaveBeenCalledWith("style-presets");
    expect(mockCacheLife).toHaveBeenCalledWith("minutes");
    expect(result).toHaveLength(1);
  });

  test("getPublishedStylePreset_ID指定で公開プリセットを返す", async () => {
    mockGetPublishedStylePresetById.mockResolvedValueOnce({
      id: "preset-1",
      title: "PARIS CODE",
      thumbnailImageUrl: "https://example.com/style.webp",
      thumbnailWidth: 912,
      thumbnailHeight: 1173,
    });

    const result = await getPublishedStylePreset("preset-1");

    expect(mockCacheTag).toHaveBeenCalledWith("style-presets");
    expect(mockCacheLife).toHaveBeenCalledWith("minutes");
    expect(mockGetPublishedStylePresetById).toHaveBeenCalledWith("preset-1");
    expect(result?.id).toBe("preset-1");
  });
});
