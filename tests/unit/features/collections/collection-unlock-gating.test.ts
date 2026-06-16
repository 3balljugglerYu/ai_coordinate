import { applyCollectionUnlockGating } from "@/features/collections/lib/collection-unlock-gating";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";

function makeCategory(
  key: string,
  overrides: Partial<StylePresetPublicSummary["category"]> = {},
): StylePresetPublicSummary["category"] {
  return {
    id: `cat-${key}`,
    key,
    displayNameJa: key,
    displayNameEn: key,
    badgeColor: "#000000",
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
    unlockPrerequisiteKey: null,
    progressiveBatchSize: null,
    ...overrides,
  };
}

function makePreset(
  id: string,
  category: StylePresetPublicSummary["category"],
): StylePresetPublicSummary {
  return {
    id,
    title: id,
    thumbnailImageUrl: `https://example.com/${id}.png`,
    thumbnailWidth: 100,
    thumbnailHeight: 100,
    hasBackgroundPrompt: false,
    category,
    imageInputMode: "single",
    dualReferenceSource: "admin",
  };
}

const PETIT_KEY = "collectible_wafer_sticker_god_petit_6p";
const PREREQ_KEY = "collectible_wafer_sticker_god_6p";

describe("applyCollectionUnlockGating", () => {
  test("前提条件なしカテゴリは一切変更しない(no-op)", () => {
    const coordinate = makeCategory("coordinate");
    const presets = [
      makePreset("a", coordinate),
      makePreset("b", coordinate),
    ];
    const result = applyCollectionUnlockGating(presets, {
      prerequisiteCompletedKeys: new Set(),
      distinctGeneratedByCategoryKey: new Map(),
    });
    expect(result).toEqual(presets);
    expect(result.every((p) => p.locked === undefined)).toBe(true);
  });

  test("前提条件未完走なら対象カテゴリのプリセットを一覧から除去する", () => {
    const coordinate = makeCategory("coordinate");
    const petit = makeCategory(PETIT_KEY, {
      unlockPrerequisiteKey: PREREQ_KEY,
      progressiveBatchSize: 2,
    });
    const presets = [
      makePreset("coord-1", coordinate),
      makePreset("petit-1", petit),
      makePreset("petit-2", petit),
    ];
    const result = applyCollectionUnlockGating(presets, {
      prerequisiteCompletedKeys: new Set(),
      distinctGeneratedByCategoryKey: new Map(),
    });
    expect(result.map((p) => p.id)).toEqual(["coord-1"]);
  });

  test("完走済みで distinct=0, batch=2, total=6 のとき先頭2つ解放・残り locked", () => {
    const petit = makeCategory(PETIT_KEY, {
      unlockPrerequisiteKey: PREREQ_KEY,
      progressiveBatchSize: 2,
    });
    const presets = Array.from({ length: 6 }, (_, i) =>
      makePreset(`petit-${i}`, petit),
    );
    const result = applyCollectionUnlockGating(presets, {
      prerequisiteCompletedKeys: new Set([PREREQ_KEY]),
      distinctGeneratedByCategoryKey: new Map([[PETIT_KEY, 0]]),
    });
    expect(result).toHaveLength(6);
    expect(result.map((p) => p.locked === true)).toEqual([
      false,
      false,
      true,
      true,
      true,
      true,
    ]);
  });

  test("完走済みで distinct=2 なら先頭4つ解放", () => {
    const petit = makeCategory(PETIT_KEY, {
      unlockPrerequisiteKey: PREREQ_KEY,
      progressiveBatchSize: 2,
    });
    const presets = Array.from({ length: 6 }, (_, i) =>
      makePreset(`petit-${i}`, petit),
    );
    const result = applyCollectionUnlockGating(presets, {
      prerequisiteCompletedKeys: new Set([PREREQ_KEY]),
      distinctGeneratedByCategoryKey: new Map([[PETIT_KEY, 2]]),
    });
    expect(result.map((p) => p.locked === true)).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
    ]);
  });

  test("batch が null なら完走済みは全解放(locked なし)", () => {
    const petit = makeCategory(PETIT_KEY, {
      unlockPrerequisiteKey: PREREQ_KEY,
      progressiveBatchSize: null,
    });
    const presets = Array.from({ length: 6 }, (_, i) =>
      makePreset(`petit-${i}`, petit),
    );
    const result = applyCollectionUnlockGating(presets, {
      prerequisiteCompletedKeys: new Set([PREREQ_KEY]),
      distinctGeneratedByCategoryKey: new Map([[PETIT_KEY, 0]]),
    });
    expect(result.every((p) => p.locked === undefined)).toBe(true);
  });
});
