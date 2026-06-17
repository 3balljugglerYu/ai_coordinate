import {
  buildCollectionUnlockAnnouncements,
  decideUnlockAnnouncement,
} from "@/features/collections/lib/collection-unlock-announcement";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";

function makeCategory(
  key: string,
  overrides: Partial<StylePresetPublicSummary["category"]> = {},
): StylePresetPublicSummary["category"] {
  return {
    id: `cat-${key}`,
    key,
    displayNameJa: key === PETIT_KEY ? "ぷち神コレクション" : key,
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

describe("decideUnlockAnnouncement", () => {
  test("解放数0は常に none", () => {
    expect(decideUnlockAnnouncement(null, 0)).toBe("none");
    expect(decideUnlockAnnouncement(2, 0)).toBe("none");
  });

  test("未記録(null)かつ解放数>0 は initial", () => {
    expect(decideUnlockAnnouncement(null, 2)).toBe("initial");
  });

  test("記録あり かつ 解放数が増えた → drip", () => {
    expect(decideUnlockAnnouncement(2, 4)).toBe("drip");
  });

  test("記録あり かつ 解放数が変わらない/減った → none", () => {
    expect(decideUnlockAnnouncement(4, 4)).toBe("none");
    expect(decideUnlockAnnouncement(4, 2)).toBe("none");
  });
});

describe("buildCollectionUnlockAnnouncements", () => {
  test("ゲートなしカテゴリは対象外(空配列)", () => {
    const coordinate = makeCategory("coordinate");
    const presets = [makePreset("a", coordinate), makePreset("b", coordinate)];
    const result = buildCollectionUnlockAnnouncements(presets, {
      prerequisiteCompletedKeys: new Set(),
      distinctGeneratedByCategoryKey: new Map(),
    });
    expect(result).toEqual([]);
  });

  test("前提未完走は対象外(空配列)", () => {
    const petit = makeCategory(PETIT_KEY, {
      unlockPrerequisiteKey: PREREQ_KEY,
      progressiveBatchSize: 2,
    });
    const presets = Array.from({ length: 6 }, (_, i) =>
      makePreset(`petit-${i}`, petit),
    );
    const result = buildCollectionUnlockAnnouncements(presets, {
      prerequisiteCompletedKeys: new Set(),
      distinctGeneratedByCategoryKey: new Map([[PETIT_KEY, 0]]),
    });
    expect(result).toEqual([]);
  });

  test("完走済み distinct=0/batch=2 → 解放2、解放順(末尾=sort最大から)でサムネを返す", () => {
    const petit = makeCategory(PETIT_KEY, {
      unlockPrerequisiteKey: PREREQ_KEY,
      progressiveBatchSize: 2,
    });
    // 入力は sort_order 昇順(petit-0..petit-5)。
    const presets = Array.from({ length: 6 }, (_, i) =>
      makePreset(`petit-${i}`, petit),
    );
    const result = buildCollectionUnlockAnnouncements(presets, {
      prerequisiteCompletedKeys: new Set([PREREQ_KEY]),
      distinctGeneratedByCategoryKey: new Map([[PETIT_KEY, 0]]),
      prerequisiteUniqueCountByKey: new Map([[PREREQ_KEY, 6]]),
    });
    expect(result).toHaveLength(1);
    const announcement = result[0];
    expect(announcement.categoryKey).toBe(PETIT_KEY);
    expect(announcement.categoryDisplayName).toBe("ぷち神コレクション");
    expect(announcement.unlockedCount).toBe(2);
    expect(announcement.totalCount).toBe(6);
    // 解放順 = 末尾から(petit-5, petit-4)。
    expect(announcement.unlockedPresets.map((p) => p.id)).toEqual([
      "petit-5",
      "petit-4",
    ]);
    // コンプリート演出 ack 比較用に、前提カテゴリ key とユニーク数が載る。
    expect(announcement.prerequisiteKey).toBe(PREREQ_KEY);
    expect(announcement.prerequisiteAckCount).toBe(6);
  });

  test("前提のユニーク数が未提供なら prerequisiteAckCount=0(比較せず常に出す)", () => {
    const petit = makeCategory(PETIT_KEY, {
      unlockPrerequisiteKey: PREREQ_KEY,
      progressiveBatchSize: 2,
    });
    const presets = Array.from({ length: 6 }, (_, i) =>
      makePreset(`petit-${i}`, petit),
    );
    const result = buildCollectionUnlockAnnouncements(presets, {
      prerequisiteCompletedKeys: new Set([PREREQ_KEY]),
      distinctGeneratedByCategoryKey: new Map([[PETIT_KEY, 0]]),
      // prerequisiteUniqueCountByKey 省略
    });
    expect(result[0].prerequisiteAckCount).toBe(0);
  });

  test("段階解放のスライス用に解放順全件が並ぶ(distinct=2 → 解放4)", () => {
    const petit = makeCategory(PETIT_KEY, {
      unlockPrerequisiteKey: PREREQ_KEY,
      progressiveBatchSize: 2,
    });
    const presets = Array.from({ length: 6 }, (_, i) =>
      makePreset(`petit-${i}`, petit),
    );
    const result = buildCollectionUnlockAnnouncements(presets, {
      prerequisiteCompletedKeys: new Set([PREREQ_KEY]),
      distinctGeneratedByCategoryKey: new Map([[PETIT_KEY, 2]]),
    });
    expect(result[0].unlockedCount).toBe(4);
    expect(result[0].unlockedPresets.map((p) => p.id)).toEqual([
      "petit-5",
      "petit-4",
      "petit-3",
      "petit-2",
    ]);
    // 「新たに解放(seen=2 → 4)」は slice(2, 4) = petit-3, petit-2。
    expect(
      result[0].unlockedPresets.slice(2, 4).map((p) => p.id),
    ).toEqual(["petit-3", "petit-2"]);
  });

  test("カテゴリの解放お知らせ設定(画像/本文/色)が announcement に載る", () => {
    const petit = makeCategory(PETIT_KEY, {
      unlockPrerequisiteKey: PREREQ_KEY,
      progressiveBatchSize: 2,
      unlockAnnouncementHeroPath: "heroes/petit/a.png",
      unlockAnnouncementInitialBody: "初回カスタム文",
      unlockAnnouncementDripBody: "段階カスタム文",
      unlockAnnouncementAccentColor: "#123456",
      unlockAnnouncementAccentHoverColor: "#654321",
      unlockAnnouncementTitleColor: "#abcdef",
      unlockAnnouncementSoftColor: "#fedcba",
    });
    const presets = Array.from({ length: 6 }, (_, i) =>
      makePreset(`petit-${i}`, petit),
    );
    const result = buildCollectionUnlockAnnouncements(presets, {
      prerequisiteCompletedKeys: new Set([PREREQ_KEY]),
      distinctGeneratedByCategoryKey: new Map([[PETIT_KEY, 0]]),
    });
    expect(result).toHaveLength(1);
    const a = result[0];
    expect(a.heroImagePath).toBe("heroes/petit/a.png");
    expect(a.initialBody).toBe("初回カスタム文");
    expect(a.dripBody).toBe("段階カスタム文");
    expect(a.accentColor).toBe("#123456");
    expect(a.accentHoverColor).toBe("#654321");
    expect(a.titleColor).toBe("#abcdef");
    expect(a.softColor).toBe("#fedcba");
  });

  test("解放お知らせ設定が未設定(null)なら announcement も null(フォールバック委譲)", () => {
    const petit = makeCategory(PETIT_KEY, {
      unlockPrerequisiteKey: PREREQ_KEY,
      progressiveBatchSize: 2,
    });
    const presets = Array.from({ length: 6 }, (_, i) =>
      makePreset(`petit-${i}`, petit),
    );
    const result = buildCollectionUnlockAnnouncements(presets, {
      prerequisiteCompletedKeys: new Set([PREREQ_KEY]),
      distinctGeneratedByCategoryKey: new Map([[PETIT_KEY, 0]]),
    });
    const a = result[0];
    expect(a.heroImagePath).toBeNull();
    expect(a.initialBody).toBeNull();
    expect(a.dripBody).toBeNull();
    expect(a.accentColor).toBeNull();
    expect(a.softColor).toBeNull();
  });
});
