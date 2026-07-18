import {
  deriveStyleBrowseChips,
  filterStyleBrowsePresets,
  STYLE_NEW_WINDOW_DAYS,
  type StyleBrowseContext,
} from "@/features/style/lib/style-browse-filter";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";

const NOW = new Date("2026-07-17T00:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function preset(
  id: string,
  overrides: {
    createdDaysAgo?: number;
    categoryKey?: string;
    categoryNameJa?: string;
    providerUserId?: string | null;
    categoryProviderUserId?: string | null;
    locked?: boolean;
    isCollectionSeries?: boolean;
    collectionDisplayStartsAt?: string | null;
    collectionDisplayEndsAt?: string | null;
  } = {},
): StylePresetPublicSummary {
  const {
    createdDaysAgo = 100,
    categoryKey = "coordinate",
    categoryNameJa = categoryKey,
    providerUserId = null,
    categoryProviderUserId = null,
    locked,
    isCollectionSeries = false,
    collectionDisplayStartsAt = null,
    collectionDisplayEndsAt = null,
  } = overrides;
  return {
    id,
    title: id,
    thumbnailImageUrl: "",
    thumbnailWidth: 1,
    thumbnailHeight: 1,
    hasBackgroundPrompt: false,
    createdAt: new Date(NOW.getTime() - createdDaysAgo * DAY_MS).toISOString(),
    category: {
      key: categoryKey,
      displayNameJa: categoryNameJa,
      displayNameEn: categoryNameJa,
      providerUserId: categoryProviderUserId,
      isCollectionSeries,
      collectionDisplayStartsAt,
      collectionDisplayEndsAt,
    } as StylePresetPublicSummary["category"],
    imageInputMode: "single",
    dualReferenceSource: "admin",
    providerUserId,
    locked,
  } as StylePresetPublicSummary;
}

function context(
  overrides: Partial<StyleBrowseContext> = {},
): StyleBrowseContext {
  return {
    favoriteIds: new Set<string>(),
    generateCounts: {},
    now: NOW,
    isAuthenticated: true,
    ...overrides,
  };
}

describe("deriveStyleBrowseChips", () => {
  test("空になる軸のチップは出さない(最小構成=すべて+お気に入り)", () => {
    const chips = deriveStyleBrowseChips([preset("a")], context());
    expect(chips.map((c) => c.id)).toEqual(["all", "favorites"]);
  });

  test("未ログインではお気に入りチップを出さない", () => {
    const chips = deriveStyleBrowseChips(
      [preset("a")],
      context({ isAuthenticated: false }),
    );
    expect(chips.map((c) => c.id)).toEqual(["all"]);
  });

  test("新着/人気/クリエイター/カテゴリ(2種以上)が揃うと全チップが出る", () => {
    const presets = [
      preset("new1", { createdDaysAgo: 3 }),
      preset("pop1", { categoryKey: "taste", categoryNameJa: "テイスト" }),
      preset("cre1", { providerUserId: "u-1" }),
    ];
    const chips = deriveStyleBrowseChips(
      presets,
      context({ generateCounts: { pop1: 5 } }),
    );
    expect(chips.map((c) => c.id)).toEqual([
      "all",
      "favorites",
      "new",
      "popular",
      "creator",
      "category:taste",
      "category:coordinate",
    ]);
    // カテゴリチップは displayName を持つ。
    expect(chips.find((c) => c.id === "category:taste")?.categoryLabelJa).toBe(
      "テイスト",
    );
  });

  test("カテゴリが1種類だけならカテゴリチップは出さない(すべてと同義)", () => {
    const chips = deriveStyleBrowseChips(
      [preset("a"), preset("b")],
      context(),
    );
    expect(chips.some((c) => c.id.startsWith("category:"))).toBe(false);
  });

  test("イベントチップ: 開催中のコレクションシリーズがあればお気に入りの直後に出る", () => {
    const presets = [
      preset("normal"),
      preset("ev", {
        categoryKey: "kotowaza_dictionary_2",
        isCollectionSeries: true,
        collectionDisplayStartsAt: new Date(NOW.getTime() - DAY_MS).toISOString(),
        collectionDisplayEndsAt: new Date(NOW.getTime() + DAY_MS).toISOString(),
      }),
    ];
    const chips = deriveStyleBrowseChips(presets, context());
    expect(chips.map((c) => c.id).slice(0, 3)).toEqual([
      "all",
      "favorites",
      "event",
    ]);
  });

  test("イベントチップ: 開催期間外(終了済み)なら出さない", () => {
    const presets = [
      preset("normal"),
      preset("ended", {
        categoryKey: "old_event",
        isCollectionSeries: true,
        collectionDisplayEndsAt: new Date(NOW.getTime() - DAY_MS).toISOString(),
      }),
    ];
    const chips = deriveStyleBrowseChips(presets, context());
    expect(chips.some((c) => c.id === "event")).toBe(false);
  });

  test("イベントチップ: コレクションシリーズ未登録(通常カテゴリ)だけなら出さない", () => {
    const chips = deriveStyleBrowseChips(
      [preset("a"), preset("b", { categoryKey: "taste" })],
      context(),
    );
    expect(chips.some((c) => c.id === "event")).toBe(false);
  });

  test("非表示指定カテゴリ(coordinate_2)のチップは出さない(プリセット自体は残る)", () => {
    const presets = [
      preset("a", { categoryKey: "coordinate" }),
      preset("b", { categoryKey: "coordinate_2", categoryNameJa: "コーディネート2.0" }),
      preset("c", { categoryKey: "taste" }),
    ];
    const chips = deriveStyleBrowseChips(presets, context());
    expect(chips.map((c) => c.id)).toEqual([
      "all",
      "favorites",
      "category:taste",
      "category:coordinate",
    ]);
    // チップを出さないだけで、絞り込み結果(すべて)からは除外しない。
    expect(
      filterStyleBrowsePresets(presets, "all", context()).map((p) => p.id),
    ).toContain("b");
  });

  test("カテゴリチップの末尾はアレンジ→テイスト→コーディネートの固定順(他は出現順で前)", () => {
    const presets = [
      preset("co", { categoryKey: "coordinate" }),
      preset("taste", { categoryKey: "character_coordinate" }),
      preset("ev", {
        categoryKey: "kotowaza_dictionary_2",
        isCollectionSeries: true,
        collectionDisplayEndsAt: new Date(NOW.getTime() + DAY_MS).toISOString(),
      }),
      preset("remix", { categoryKey: "character_remix" }),
    ];
    const chips = deriveStyleBrowseChips(presets, context());
    expect(chips.map((c) => c.id).filter((id) => id.startsWith("category:"))).toEqual([
      "category:kotowaza_dictionary_2",
      "category:character_remix",
      "category:character_coordinate",
      "category:coordinate",
    ]);
  });

  test("カテゴリ提供者(category.providerUserId)でもクリエイターチップが出る", () => {
    const chips = deriveStyleBrowseChips(
      [preset("a", { categoryProviderUserId: "u-9" })],
      context(),
    );
    expect(chips.some((c) => c.id === "creator")).toBe(true);
  });
});

describe("filterStyleBrowsePresets", () => {
  const presets = [
    preset("old", { createdDaysAgo: 100 }),
    preset("new", { createdDaysAgo: STYLE_NEW_WINDOW_DAYS - 1 }),
    preset("pop-low", { createdDaysAgo: 50 }),
    preset("pop-high", { createdDaysAgo: 50 }),
    preset("creator", { providerUserId: "u-1" }),
    preset("taste", { categoryKey: "taste" }),
  ];
  const ctx = context({
    favoriteIds: new Set(["old", "taste"]),
    generateCounts: { "pop-low": 2, "pop-high": 10 },
  });

  test("all: 全件をそのままの並びで返す", () => {
    expect(filterStyleBrowsePresets(presets, "all", ctx).map((p) => p.id)).toEqual(
      ["old", "new", "pop-low", "pop-high", "creator", "taste"],
    );
  });

  test("favorites: お気に入りIDのみ", () => {
    expect(
      filterStyleBrowsePresets(presets, "favorites", ctx).map((p) => p.id),
    ).toEqual(["old", "taste"]);
  });

  test("new: 14日以内のみ", () => {
    expect(filterStyleBrowsePresets(presets, "new", ctx).map((p) => p.id)).toEqual(
      ["new"],
    );
  });

  test("popular: 生成数>0のみを降順で", () => {
    expect(
      filterStyleBrowsePresets(presets, "popular", ctx).map((p) => p.id),
    ).toEqual(["pop-high", "pop-low"]);
  });

  test("creator: 提供者付きのみ", () => {
    expect(
      filterStyleBrowsePresets(presets, "creator", ctx).map((p) => p.id),
    ).toEqual(["creator"]);
  });

  test("event: 開催中のコレクションシリーズのプリセットのみ", () => {
    const withEvent = [
      ...presets,
      preset("ev1", {
        categoryKey: "kotowaza_dictionary_2",
        isCollectionSeries: true,
        collectionDisplayEndsAt: new Date(NOW.getTime() + DAY_MS).toISOString(),
      }),
      preset("ended", {
        categoryKey: "old_event",
        isCollectionSeries: true,
        collectionDisplayEndsAt: new Date(NOW.getTime() - DAY_MS).toISOString(),
      }),
    ];
    expect(
      filterStyleBrowsePresets(withEvent, "event", ctx).map((p) => p.id),
    ).toEqual(["ev1"]);
  });

  test("category:<key>: 該当カテゴリのみ", () => {
    expect(
      filterStyleBrowsePresets(presets, "category:taste", ctx).map((p) => p.id),
    ).toEqual(["taste"]);
  });

  test("category:coordinate: 集約対象の coordinate_2 も含める", () => {
    const withV2 = [
      ...presets,
      preset("co2", { categoryKey: "coordinate_2" }),
    ];
    expect(
      filterStyleBrowsePresets(withV2, "category:coordinate", ctx).map(
        (p) => p.id,
      ),
    ).toEqual(["old", "new", "pop-low", "pop-high", "creator", "co2"]);
  });

  test("locked(シルエット)も除外しない(現行ストリップと同じ)", () => {
    const withLocked = [...presets, preset("locked", { locked: true })];
    expect(
      filterStyleBrowsePresets(withLocked, "all", ctx).map((p) => p.id),
    ).toContain("locked");
  });
});
