import {
  deriveEventShelves,
  collectShelfPresetIds,
  listActiveEventCategoryKeys,
} from "@/features/home/lib/derive-event-shelves";
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
    isCollectionSeries: false,
    completionThreshold: null,
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
  locked?: boolean,
): StylePresetPublicSummary {
  const preset: StylePresetPublicSummary = {
    id,
    title: id,
    thumbnailImageUrl: `https://example.com/${id}.png`,
    thumbnailWidth: 100,
    thumbnailHeight: 100,
    hasBackgroundPrompt: false,
    createdAt: "2026-01-01T00:00:00Z",
    category,
    imageInputMode: "single",
    dualReferenceSource: "admin",
  };
  return locked ? { ...preset, locked: true } : preset;
}

const NOW = new Date("2026-07-06T00:00:00Z");

/** イタリア旅行相当: sequential・9枠・開催期間 7/3〜7/12 */
function italyCategory(overrides: Partial<StylePresetPublicSummary["category"]> = {}) {
  return makeCategory("travel_to_italy", {
    isCollectionSeries: true,
    sequentialUnlock: true,
    completionThreshold: 9,
    collectionDisplayStartsAt: "2026-07-03T10:00:00Z",
    collectionDisplayEndsAt: "2026-07-12T13:00:00Z",
    ...overrides,
  });
}

/** sequential では先頭から順に生成されるので、生成済みID集合=先頭N個 */
function italyGeneratedIds(distinct: number): Map<string, ReadonlySet<string>> {
  return new Map([
    [
      "travel_to_italy",
      new Set(Array.from({ length: distinct }, (_, i) => `italy-${i}`)),
    ],
  ]);
}

/** 9プリセットを実ゲート(applyCollectionUnlockGating)へ通した出力を作る */
function gatedItalyPresets(distinct: number) {
  const cat = italyCategory();
  const presets = Array.from({ length: 9 }, (_, i) =>
    makePreset(`italy-${i}`, cat),
  );
  return applyCollectionUnlockGating(presets, {
    prerequisiteCompletedKeys: new Set(),
    distinctGeneratedByCategoryKey: new Map([["travel_to_italy", distinct]]),
  });
}

describe("deriveEventShelves", () => {
  test("初日(生成0): NEW(表紙) → teaser の2枚。カウンター0/9", () => {
    const shelves = deriveEventShelves(
      gatedItalyPresets(0),
      new Map([["travel_to_italy", 0]]),
      italyGeneratedIds(0),
      NOW,
    );
    expect(shelves).toHaveLength(1);
    const shelf = shelves[0];
    expect(shelf.cards.map((c) => c.kind)).toEqual(["new", "teaser"]);
    expect(shelf.cards[0].preset?.id).toBe("italy-0");
    expect(shelf.cards[1].preset?.id).toBe("italy-1");
    expect(shelf.collectedCount).toBe(0);
    expect(shelf.totalCount).toBe(9);
    expect(shelf.isCompleted).toBe(false);
    expect(shelf.endsAt).toBe("2026-07-12T13:00:00Z");
  });

  test("中盤(生成2): NEW → teaser → done×2 の並び。doneは昇順のまま", () => {
    const shelves = deriveEventShelves(
      gatedItalyPresets(2),
      new Map([["travel_to_italy", 2]]),
      italyGeneratedIds(2),
      NOW,
    );
    const shelf = shelves[0];
    expect(shelf.cards.map((c) => c.kind)).toEqual([
      "new",
      "teaser",
      "done",
      "done",
    ]);
    // 解放済み=italy-0..2、生成済み=先頭2つ、NEW=italy-2、teaser=italy-3
    expect(shelf.cards[0].preset?.id).toBe("italy-2");
    expect(shelf.cards[1].preset?.id).toBe("italy-3");
    expect(shelf.cards[2].preset?.id).toBe("italy-0");
    expect(shelf.cards[3].preset?.id).toBe("italy-1");
    expect(shelf.collectedCount).toBe(2);
  });

  test("全コンプ(生成9): celebration が先頭、teaser は出ない。9/9", () => {
    const shelves = deriveEventShelves(
      gatedItalyPresets(9),
      new Map([["travel_to_italy", 9]]),
      italyGeneratedIds(9),
      NOW,
    );
    const shelf = shelves[0];
    expect(shelf.isCompleted).toBe(true);
    expect(shelf.cards[0]).toEqual({ kind: "celebration", preset: null });
    expect(shelf.cards.filter((c) => c.kind === "teaser")).toHaveLength(0);
    expect(shelf.cards.filter((c) => c.kind === "done")).toHaveLength(9);
    expect(shelf.collectedCount).toBe(9);
  });

  test("表示期間外(終了後)は棚を出さない", () => {
    const after = new Date("2026-07-12T13:00:01Z");
    const shelves = deriveEventShelves(
      gatedItalyPresets(2),
      new Map([["travel_to_italy", 2]]),
      italyGeneratedIds(2),
      after,
    );
    expect(shelves).toHaveLength(0);
  });

  test("開始前も棚を出さない", () => {
    const before = new Date("2026-07-03T09:59:59Z");
    const shelves = deriveEventShelves(
      gatedItalyPresets(0),
      new Map(),
      new Map(),
      before,
    );
    expect(shelves).toHaveLength(0);
  });

  test("未ログイン(空コンテキスト)は初日状態になる", () => {
    const shelves = deriveEventShelves(
      gatedItalyPresets(0),
      new Map(),
      new Map(),
      NOW,
    );
    expect(shelves[0].cards.map((c) => c.kind)).toEqual(["new", "teaser"]);
    expect(shelves[0].collectedCount).toBe(0);
  });

  test("コレクションシリーズでないカテゴリは対象外", () => {
    const plain = makeCategory("coordinate");
    const shelves = deriveEventShelves(
      [makePreset("a", plain)],
      new Map(),
      new Map(),
      NOW,
    );
    expect(shelves).toHaveLength(0);
  });

  test("複数企画は終了が近い順に並ぶ", () => {
    const soon = italyCategory();
    const later = makeCategory("second_event", {
      isCollectionSeries: true,
      sequentialUnlock: true,
      completionThreshold: 6,
      collectionDisplayStartsAt: "2026-07-01T00:00:00Z",
      collectionDisplayEndsAt: "2026-07-31T00:00:00Z",
    });
    const shelves = deriveEventShelves(
      [
        makePreset("later-0", later),
        makePreset("later-1", later, true),
        makePreset("italy-0", soon),
        makePreset("italy-1", soon, true),
      ],
      new Map(),
      new Map(),
      NOW,
    );
    expect(shelves.map((s) => s.categoryKey)).toEqual([
      "travel_to_italy",
      "second_event",
    ]);
  });

  test("一斉公開(非sequential)のシリーズも棚に出て、ID集合で✓済みが付く", () => {
    // 神コレ型: is_collection_series のみ(順次解放なし・前提なし) → gating は no-op
    const wafer = makeCategory("wafer_like", {
      isCollectionSeries: true,
      sequentialUnlock: false,
      completionThreshold: 6,
      collectionDisplayStartsAt: "2026-07-03T10:00:00Z",
      collectionDisplayEndsAt: "2026-07-12T13:00:00Z",
    });
    const presets = Array.from({ length: 6 }, (_, i) =>
      makePreset(`w-${i}`, wafer),
    );
    // 生成順は任意(w-1 と w-4 だけ生成済み)。一斉公開は位置ベースでは判定できない
    const shelves = deriveEventShelves(
      presets,
      new Map(),
      new Map([["wafer_like", new Set(["w-1", "w-4"])]]),
      NOW,
    );
    expect(shelves).toHaveLength(1);
    const shelf = shelves[0];
    expect(shelf.cards.map((c) => c.kind)).toEqual([
      "new",
      "new",
      "new",
      "new",
      "done",
      "done",
    ]);
    expect(shelf.cards.filter((c) => c.kind === "done").map((c) => c.preset?.id)).toEqual(
      ["w-1", "w-4"],
    );
    // 解放コンテキスト対象外なのでカウンターはID集合サイズで代替
    expect(shelf.collectedCount).toBe(2);
    expect(shelf.totalCount).toBe(6);
  });

  test("一斉公開シリーズの全コンプでも celebration が先頭に付く", () => {
    const wafer = makeCategory("wafer_like", {
      isCollectionSeries: true,
      sequentialUnlock: false,
      completionThreshold: 3,
      collectionDisplayEndsAt: "2026-07-12T13:00:00Z",
    });
    const presets = Array.from({ length: 3 }, (_, i) =>
      makePreset(`w-${i}`, wafer),
    );
    const shelves = deriveEventShelves(
      presets,
      new Map(),
      new Map([["wafer_like", new Set(["w-0", "w-1", "w-2"])]]),
      NOW,
    );
    expect(shelves[0].isCompleted).toBe(true);
    expect(shelves[0].cards[0].kind).toBe("celebration");
  });

  test("listActiveEventCategoryKeys は開催中シリーズの key を重複なしで返す", () => {
    const italy = italyCategory();
    const wafer = makeCategory("wafer_like", {
      isCollectionSeries: true,
      sequentialUnlock: false,
      collectionDisplayEndsAt: "2026-07-12T13:00:00Z",
    });
    const ended = makeCategory("ended", {
      isCollectionSeries: true,
      collectionDisplayEndsAt: "2026-07-01T00:00:00Z",
    });
    const keys = listActiveEventCategoryKeys(
      [
        makePreset("i-0", italy),
        makePreset("i-1", italy),
        makePreset("w-0", wafer),
        makePreset("e-0", ended),
        makePreset("c-0", makeCategory("coordinate")),
      ],
      NOW,
    );
    expect(keys).toEqual(["travel_to_italy", "wafer_like"]);
  });

  test("collectShelfPresetIds は celebration を除く全カードの preset id を返す", () => {
    const shelves = deriveEventShelves(
      gatedItalyPresets(9),
      new Map([["travel_to_italy", 9]]),
      italyGeneratedIds(9),
      NOW,
    );
    const ids = collectShelfPresetIds(shelves);
    expect(ids.size).toBe(9);
    expect(ids.has("italy-0")).toBe(true);
    expect(ids.has("italy-8")).toBe(true);
  });
});
