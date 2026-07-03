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
    collectionDisplayStartsAt: null,
    collectionDisplayEndsAt: null,
    unlockPrerequisiteKey: null,
    progressiveBatchSize: null,
    sequentialUnlock: false,
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

  describe("sequential unlock(順番固定・前提なし・先頭=表紙から昇順)", () => {
    const SEQ_KEY = "travel_to_italy";
    function seqPresets() {
      // index0=表紙(sort_order 最小), 1..8=Day1..Day8
      const cat = makeCategory(SEQ_KEY, {
        unlockPrerequisiteKey: null,
        sequentialUnlock: true,
        progressiveBatchSize: null, // 未設定 → 1扱い
      });
      return Array.from({ length: 9 }, (_, i) => makePreset(`p-${i}`, cat));
    }

    test("生成0: 表紙だけ解放 + 次の1つ(Day1)だけシルエット、その先は非表示", () => {
      const result = applyCollectionUnlockGating(seqPresets(), {
        prerequisiteCompletedKeys: new Set(),
        distinctGeneratedByCategoryKey: new Map([[SEQ_KEY, 0]]),
      });
      // 表示は2枚だけ: p-0(解放) + p-1(ティザー)。p-2..p-8 は出さない。
      expect(result.map((p) => p.id)).toEqual(["p-0", "p-1"]);
      expect(result[0].locked).toBeUndefined(); // 表紙=解放
      expect(result[1].locked).toBe(true); // 次の1つだけシークレット
    });

    test("生成3: 表紙+Day1..3 解放 + 次の1つ(index4)だけシルエット", () => {
      const result = applyCollectionUnlockGating(seqPresets(), {
        prerequisiteCompletedKeys: new Set(),
        distinctGeneratedByCategoryKey: new Map([[SEQ_KEY, 3]]),
      });
      // 解放4枚(index0..3)+ ティザー1枚(index4)= 5枚表示。index5.. は非表示。
      expect(result.map((p) => p.id)).toEqual(["p-0", "p-1", "p-2", "p-3", "p-4"]);
      expect(result.slice(0, 4).every((p) => p.locked === undefined)).toBe(true);
      expect(result[4].locked).toBe(true);
    });

    test("生成7: 8枚解放 + 最後の1つ(Day8)だけシルエット", () => {
      const result = applyCollectionUnlockGating(seqPresets(), {
        prerequisiteCompletedKeys: new Set(),
        distinctGeneratedByCategoryKey: new Map([[SEQ_KEY, 7]]),
      });
      expect(result.length).toBe(9); // 8解放 + 最後の1ティザー
      expect(result.slice(0, 8).every((p) => p.locked === undefined)).toBe(true);
      expect(result[8].locked).toBe(true);
    });

    test("生成8: 最後も解放済み(生成可)・ティザーなし", () => {
      const result = applyCollectionUnlockGating(seqPresets(), {
        prerequisiteCompletedKeys: new Set(),
        distinctGeneratedByCategoryKey: new Map([[SEQ_KEY, 8]]),
      });
      expect(result.length).toBe(9); // 全9枚 解放(最後は未生成だが生成可=シルエットでない)
      expect(result.every((p) => p.locked === undefined)).toBe(true);
    });

    test("全生成: 全解放(ティザーなし)", () => {
      const result = applyCollectionUnlockGating(seqPresets(), {
        prerequisiteCompletedKeys: new Set(),
        distinctGeneratedByCategoryKey: new Map([[SEQ_KEY, 9]]),
      });
      expect(result.length).toBe(9);
      expect(result.every((p) => p.locked === undefined)).toBe(true);
    });
  });
});
