/** @jest-environment node */

/**
 * ホームの「ハロウィン企画」の棚の置き場所(2026-10-17 ユーザー決定: 簡単お着替えの上)。
 *
 * 棚は簡単お着替えと同じ区画に入れて、一度に出す。別の読み込みにすると、
 * あとから差し込まれて下の簡単お着替えとフィードが押し下がる。
 * 描画はせず、区画が返す要素の並びと props だけを見る。
 */

jest.mock("next/cache", () => ({
  cacheLife: () => {},
  cacheTag: () => {},
}));
jest.mock("@/lib/supabase/server", () => ({ createClient: jest.fn() }));
jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/features/style-presets/lib/get-public-style-presets", () => ({
  getPublishedStylePresets: jest.fn(),
}));
jest.mock("@/features/collections/lib/collection-unlock-server", () => ({
  resolveCollectionUnlockContext: jest.fn(),
}));
jest.mock("@/features/collections/lib/generated-preset-ids", () => ({
  getGeneratedCollectionPresetIds: jest.fn(),
}));
jest.mock("@/features/collections/lib/public-mount-server-api", () => ({
  buildPublicGeneratedImageUrl: jest.fn(),
}));
jest.mock("@/features/style/lib/style-popularity", () => ({
  getStyleGenerateCounts: jest.fn(),
  getStyleGenerateTotalCounts: jest.fn(),
}));
jest.mock("@/features/home/lib/home-halloween-shelf", () => ({
  getHomeHalloweenShelfItems: jest.fn(),
  getHomeHalloweenEntryProgress: jest.fn(),
}));
// 部品は描画しない(要素の type で見分けるだけ)
jest.mock("@/features/collections/components/PetitUnlockAnnouncer", () => ({
  PetitUnlockAnnouncer: function PetitUnlockAnnouncer() {
    return null;
  },
}));
jest.mock("@/features/home/components/HomeEventShelfSection", () => ({
  HomeEventShelfSection: function HomeEventShelfSection() {
    return null;
  },
}));
jest.mock("@/features/home/components/HomeStylePresetCarousel", () => ({
  HomeStylePresetCarousel: function HomeStylePresetCarousel() {
    return null;
  },
}));
jest.mock("@/features/home/components/HomeHalloweenCatalogShelf", () => ({
  HomeHalloweenCatalogShelf: function HomeHalloweenCatalogShelf() {
    return null;
  },
}));

import type React from "react";
import { getPublishedStylePresets } from "@/features/style-presets/lib/get-public-style-presets";
import {
  getStyleGenerateCounts,
  getStyleGenerateTotalCounts,
} from "@/features/style/lib/style-popularity";
import {
  getHomeHalloweenEntryProgress,
  getHomeHalloweenShelfItems,
} from "@/features/home/lib/home-halloween-shelf";
import { HomeHalloweenCatalogShelf } from "@/features/home/components/HomeHalloweenCatalogShelf";
import { HomeStylePresetCarousel } from "@/features/home/components/HomeStylePresetCarousel";
import { CachedHomeStylePresetSection } from "@/features/home/components/CachedHomeStylePresetSection";

const mockPresets = getPublishedStylePresets as jest.Mock;
const mockShelfItems = getHomeHalloweenShelfItems as jest.Mock;
const mockEntryProgress = getHomeHalloweenEntryProgress as jest.Mock;

type Element = React.ReactElement<Record<string, unknown>>;

/** 区画が返す Fragment の子を、並び順のまま平らにする(棚の map の配列も開く) */
function childrenOf(node: Element): Element[] {
  const children = (node.props as { children?: unknown }).children;
  const list = Array.isArray(children) ? children.flat(Infinity) : [children];
  return list.filter((child): child is Element => typeof child === "object" && child !== null);
}

const SHELF_ITEMS = [
  { postId: "post-1", authorName: "はるぼぼ", thumbnailUrl: "https://img.test/1.webp" },
  { postId: "post-2", authorName: "マサ", thumbnailUrl: "https://img.test/2.webp" },
];

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-10-20T12:00:00+09:00"));
  mockPresets.mockResolvedValue([]);
  (getStyleGenerateCounts as jest.Mock).mockResolvedValue({});
  (getStyleGenerateTotalCounts as jest.Mock).mockResolvedValue({});
  mockShelfItems.mockResolvedValue(SHELF_ITEMS);
  mockEntryProgress.mockResolvedValue(null);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("ホームの「ハロウィン企画」の棚の置き場所", () => {
  test("⭐簡単お着替えの上に置き、読んだ作品をそのまま渡す", async () => {
    const node = (await CachedHomeStylePresetSection({})) as Element;
    const children = childrenOf(node);

    const shelfIndex = children.findIndex((child) => child.type === HomeHalloweenCatalogShelf);
    const carouselIndex = children.findIndex((child) => child.type === HomeStylePresetCarousel);
    expect(shelfIndex).toBeGreaterThanOrEqual(0);
    expect(carouselIndex).toBe(shelfIndex + 1);
    expect(children[shelfIndex].props.items).toEqual(SHELF_ITEMS);
  });

  test("作品は、区画を描いた時刻で選ぶ(期間の判定はその中)", async () => {
    await CachedHomeStylePresetSection({});

    expect(mockShelfItems).toHaveBeenCalledTimes(1);
    expect(mockShelfItems).toHaveBeenCalledWith(new Date("2026-10-20T12:00:00+09:00").getTime());
  });

  test("⭐棚が自動で流れる数(8件以上)なら、簡単お着替えは棚より1秒遅れて流し始める", async () => {
    mockShelfItems.mockResolvedValue(
      Array.from({ length: 8 }, (_, index) => ({
        postId: `post-${index}`,
        authorName: `作者${index}`,
        thumbnailUrl: `https://img.test/${index}.webp`,
      })),
    );

    const node = (await CachedHomeStylePresetSection({})) as Element;
    const carousel = childrenOf(node).find((child) => child.type === HomeStylePresetCarousel);

    expect(carousel?.props.autoScrollStartDelayMs).toBe(1000);
  });

  test("棚が流れない数(7件以下)なら、簡単お着替えは待たずに流す", async () => {
    mockShelfItems.mockResolvedValue(
      Array.from({ length: 7 }, (_, index) => ({
        postId: `post-${index}`,
        authorName: `作者${index}`,
        thumbnailUrl: `https://img.test/${index}.webp`,
      })),
    );

    const node = (await CachedHomeStylePresetSection({})) as Element;
    const carousel = childrenOf(node).find((child) => child.type === HomeStylePresetCarousel);

    expect(carousel?.props.autoScrollStartDelayMs).toBe(0);
  });

  test("⭐エントリーした人の進み具合を、本人ごとに描いた時刻で読み、棚へ渡す", async () => {
    mockEntryProgress.mockResolvedValue({ entered: true, usedWorks: 4 });

    const node = (await CachedHomeStylePresetSection({ userId: "user-1" })) as Element;
    const shelf = childrenOf(node).find((child) => child.type === HomeHalloweenCatalogShelf);

    expect(mockEntryProgress).toHaveBeenCalledWith(
      "user-1",
      new Date("2026-10-20T12:00:00+09:00").getTime(),
    );
    expect(shelf?.props.entryProgress).toEqual({ entered: true, usedWorks: 4 });
  });

  test("まだエントリーしていなければ、そのことを棚へ渡す(棚の上でエントリーを呼びかける。2026-10-25)", async () => {
    mockEntryProgress.mockResolvedValue({ entered: false });

    const node = (await CachedHomeStylePresetSection({ userId: "user-1" })) as Element;
    const shelf = childrenOf(node).find((child) => child.type === HomeHalloweenCatalogShelf);

    expect(shelf?.props.entryProgress).toEqual({ entered: false });
  });

  test("ログインしていなければ、進み具合は null のまま棚へ渡す", async () => {
    const node = (await CachedHomeStylePresetSection({})) as Element;
    const shelf = childrenOf(node).find((child) => child.type === HomeHalloweenCatalogShelf);

    expect(mockEntryProgress).toHaveBeenCalledWith(null, expect.any(Number));
    expect(shelf?.props.entryProgress).toBeNull();
  });

  test("棚の作品が無いときも、簡単お着替えは出す", async () => {
    mockShelfItems.mockResolvedValue([]);

    const node = (await CachedHomeStylePresetSection({})) as Element;
    const children = childrenOf(node);

    const carousel = children.find((child) => child.type === HomeStylePresetCarousel);
    expect(carousel).toBeDefined();
    // 棚が無いので待たない
    expect(carousel?.props.autoScrollStartDelayMs).toBe(0);
    const shelf = children.find((child) => child.type === HomeHalloweenCatalogShelf);
    expect(shelf?.props.items).toEqual([]);
  });
});
