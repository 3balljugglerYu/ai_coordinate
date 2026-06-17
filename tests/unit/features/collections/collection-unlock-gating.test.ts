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
    unlockAnnouncementHeroPath: null,
    unlockAnnouncementInitialBody: null,
    unlockAnnouncementDripBody: null,
    unlockAnnouncementAccentColor: null,
    unlockAnnouncementAccentHoverColor: null,
    unlockAnnouncementTitleColor: null,
    unlockAnnouncementSoftColor: null,
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

  // 解放ゲート付きカテゴリは「表示は sort_order 昇順のまま」で、解放だけを sort_order の
  // 多い方(末尾)から行う。これにより先頭にシルエット、末尾に解放済みが並ぶ。
  // 入力は sort_order 昇順(petit-0..petit-5)。
  test("完走済み distinct=0/batch=2 は表示昇順のまま末尾2つ(sort最大)を解放", () => {
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
    // 表示は昇順のまま(petit-0..petit-5)。並べ替えはしない。
    expect(result.map((p) => p.id)).toEqual([
      "petit-0",
      "petit-1",
      "petit-2",
      "petit-3",
      "petit-4",
      "petit-5",
    ]);
    // 解放は末尾2つ(petit-4, petit-5 = sort 最大)。先頭4つがシルエット。
    expect(result.map((p) => p.locked === true)).toEqual([
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  test("完走済み distinct=2 なら末尾4つを解放(表示昇順のまま)", () => {
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
    expect(result.map((p) => p.id)).toEqual([
      "petit-0",
      "petit-1",
      "petit-2",
      "petit-3",
      "petit-4",
      "petit-5",
    ]);
    // 解放数4 → 末尾4つ(petit-2..petit-5)を解放、先頭2つがシルエット。
    expect(result.map((p) => p.locked === true)).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  test("前提条件なしの従来カテゴリは昇順・先頭から解放(変更なし)", () => {
    const plain = makeCategory("coordinate");
    const presets = [
      makePreset("a", plain),
      makePreset("b", plain),
      makePreset("c", plain),
    ];
    const result = applyCollectionUnlockGating(presets, {
      prerequisiteCompletedKeys: new Set(),
      distinctGeneratedByCategoryKey: new Map(),
    });
    expect(result.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  test("batch が null なら完走済みは全解放(locked なし・表示昇順のまま)", () => {
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
    expect(result.map((p) => p.id)).toEqual([
      "petit-0",
      "petit-1",
      "petit-2",
      "petit-3",
      "petit-4",
      "petit-5",
    ]);
  });
});
