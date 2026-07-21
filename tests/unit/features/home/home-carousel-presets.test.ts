import {
  CAROUSEL_MAX_ITEMS,
  CAROUSEL_MAX_NEW_ITEMS,
  deriveHomeCarouselPresets,
} from "@/features/home/lib/home-carousel-presets";
import { STYLE_NEW_WINDOW_DAYS } from "@/features/style/lib/style-browse-filter";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";

const NOW = new Date("2026-07-20T00:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function preset(
  id: string,
  createdDaysAgo: number,
  publishedDaysAgo: number | null = createdDaysAgo,
): StylePresetPublicSummary {
  return {
    id,
    title: id,
    thumbnailImageUrl: "",
    thumbnailWidth: 1,
    thumbnailHeight: 1,
    hasBackgroundPrompt: false,
    createdAt: new Date(NOW.getTime() - createdDaysAgo * DAY_MS).toISOString(),
    publishedAt:
      publishedDaysAgo === null
        ? null
        : new Date(NOW.getTime() - publishedDaysAgo * DAY_MS).toISOString(),
    category: {
      key: "coordinate",
      displayNameJa: "コーディネート",
      displayNameEn: "Coordinate",
    } as StylePresetPublicSummary["category"],
    imageInputMode: "single",
    dualReferenceSource: "admin",
  } as StylePresetPublicSummary;
}

describe("deriveHomeCarouselPresets", () => {
  test("新着(14日以内)が作成日の新しい順で先頭、続いて人気順", () => {
    const presets = [
      preset("old-pop", 100),
      preset("new-3d", 3),
      preset("old-mid", 100),
      preset("new-1d", 1),
    ];
    const result = deriveHomeCarouselPresets(
      presets,
      { "old-pop": 10, "old-mid": 5 },
      NOW,
    );
    expect(result.map((p) => p.id)).toEqual([
      "new-1d",
      "new-3d",
      "old-pop",
      "old-mid",
    ]);
  });

  test("新着枠は最大枚数までに制限され、超過分は人気枠で競う", () => {
    const presets = [
      ...Array.from({ length: CAROUSEL_MAX_NEW_ITEMS + 2 }, (_, i) =>
        preset(`new-${i}`, i + 1),
      ),
      preset("popular", 100),
    ];
    const result = deriveHomeCarouselPresets(presets, { popular: 50 }, NOW);
    // 先頭は新着(新しい順)で CAROUSEL_MAX_NEW_ITEMS 枚まで。
    expect(result.slice(0, CAROUSEL_MAX_NEW_ITEMS).map((p) => p.id)).toEqual(
      Array.from({ length: CAROUSEL_MAX_NEW_ITEMS }, (_, i) => `new-${i}`),
    );
    // 新着枠から漏れた新着は人気0なので、人気ありの popular が先に来る。
    expect(result[CAROUSEL_MAX_NEW_ITEMS].id).toBe("popular");
  });

  test("新着窓(STYLE_NEW_WINDOW_DAYS)を過ぎたものは新着枠に入らない", () => {
    const presets = [
      preset("expired", STYLE_NEW_WINDOW_DAYS + 1),
      preset("in-window", STYLE_NEW_WINDOW_DAYS - 1),
    ];
    const result = deriveHomeCarouselPresets(
      presets,
      { expired: 100 },
      NOW,
    );
    // 期限切れは人気枠扱いだが生成数100で先着の新着に次ぐ。
    expect(result.map((p) => p.id)).toEqual(["in-window", "expired"]);
  });

  test("合計は最大枚数に制限される", () => {
    const presets = Array.from({ length: CAROUSEL_MAX_ITEMS + 10 }, (_, i) =>
      preset(`p-${i}`, 100),
    );
    const result = deriveHomeCarouselPresets(presets, {}, NOW);
    expect(result).toHaveLength(CAROUSEL_MAX_ITEMS);
  });

  test("集計が空でも新着→既存の並び順で成立する(フォールバック)", () => {
    const presets = [preset("a", 100), preset("b", 2), preset("c", 100)];
    const result = deriveHomeCarouselPresets(presets, {}, NOW);
    expect(result.map((p) => p.id)).toEqual(["b", "a", "c"]);
  });

  test("下書き期間が長くても公開が直近なら新着になる(publishedAt優先)", () => {
    const presets = [
      // 100日前に下書き作成 → 2日前に公開
      preset("old-draft-published-now", 100, 2),
      // 100日前に作成・公開済み(人気あり)
      preset("old-published", 100, 100),
    ];
    const result = deriveHomeCarouselPresets(
      presets,
      { "old-published": 50 },
      NOW,
    );
    expect(result.map((p) => p.id)).toEqual([
      "old-draft-published-now",
      "old-published",
    ]);
  });

  test("publishedAt が null(移行前データ等)なら createdAt にフォールバック", () => {
    const presets = [
      preset("legacy-new", 3, null),
      preset("legacy-old", 100, null),
    ];
    const result = deriveHomeCarouselPresets(presets, {}, NOW);
    expect(result.map((p) => p.id)).toEqual(["legacy-new", "legacy-old"]);
  });

  test("日付が不正な値でも新着扱いせずクラッシュしない", () => {
    const broken = {
      ...preset("broken", 1, null),
      createdAt: "invalid",
    };
    const result = deriveHomeCarouselPresets(
      [broken, preset("ok", 1)],
      {},
      NOW,
    );
    expect(result.map((p) => p.id)).toEqual(["ok", "broken"]);
  });
});
