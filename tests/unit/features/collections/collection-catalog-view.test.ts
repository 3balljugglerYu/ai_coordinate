/** @jest-environment node */

import { buildCollectionCatalogView } from "@/features/collections/lib/collection-catalog-view";
import type { CollectionCatalogItem } from "@/features/collections/lib/collection-catalog-repository";
import type { CollectionProgress } from "@/features/collections/lib/collection-types";

function makeCatalogItem(
  overrides: Partial<CollectionCatalogItem> & { key: string },
): CollectionCatalogItem {
  const base: CollectionCatalogItem = {
    id: `id-${overrides.key}`,
    key: overrides.key,
    displayNameJa: overrides.key,
    displayNameEn: overrides.key,
    completionThreshold: 6,
    characterImageUrl: `https://example.com/${overrides.key}.webp`,
    mountTemplateUrl: null,
    displayOrder: 0,
    unlockPrerequisiteKey: null,
    collectionDisplayStartsAt: null,
    collectionDisplayEndsAt: null,
  };
  return { ...base, ...overrides };
}

function makeProgress(
  key: string,
  uniqueOutfitCount: number,
  isCompleted = false,
): CollectionProgress {
  return {
    categoryId: `id-${key}`,
    categoryKey: key,
    displayNameJa: key,
    displayNameEn: key,
    completionThreshold: 6,
    uniqueOutfitCount,
    isCompleted,
    mountStatus: isCompleted ? "completed" : null,
    mountImagePath: null,
    completedAt: null,
    characterImageUrl: null,
    collectedImageUrls: [],
    completionId: null,
    mountTemplateWidth: null,
    mountTemplateHeight: null,
    progressModalFrameUrl: null,
    progressModalFrameWidth: null,
    progressModalFrameHeight: null,
    progressModalSlots: null,
    progressModalButton: null,
    progressModalCenter: null,
    progressModalRingColor: null,
    progressModalBadgeColor: null,
    progressModalBadgeTextColor: null,
    progressModalBadgeBgColor: null,
    progressModalButtonColor: null,
    progressModalButtonTextColor: null,
  };
}

describe("buildCollectionCatalogView", () => {
  test("匿名(進捗なし)は全カタログを未着手で返す", () => {
    const view = buildCollectionCatalogView(
      [makeCatalogItem({ key: "a" }), makeCatalogItem({ key: "b" })],
      [],
    );
    expect(view).toHaveLength(2);
    expect(view.every((e) => e.state === "not_started")).toBe(true);
    expect(view[0]?.uniqueOutfitCount).toBe(0);
    expect(view[0]?.remaining).toBe(6);
    expect(view[0]?.imageUrl).toBe("https://example.com/a.webp");
  });

  test("進捗をマージして状態を付ける(完成/進行中/未着手)", () => {
    const view = buildCollectionCatalogView(
      [
        makeCatalogItem({ key: "done" }),
        makeCatalogItem({ key: "wip" }),
        makeCatalogItem({ key: "new" }),
      ],
      [makeProgress("done", 6, true), makeProgress("wip", 3)],
    );
    const byKey = Object.fromEntries(view.map((e) => [e.key, e]));
    expect(byKey.done.state).toBe("completed");
    expect(byKey.wip.state).toBe("in_progress");
    expect(byKey.wip.remaining).toBe(3);
    expect(byKey.new.state).toBe("not_started");
  });

  test("並び順は 進行中 → 未着手 → 完成", () => {
    const view = buildCollectionCatalogView(
      [
        makeCatalogItem({ key: "done" }),
        makeCatalogItem({ key: "new" }),
        makeCatalogItem({ key: "wip" }),
      ],
      [makeProgress("done", 6, true), makeProgress("wip", 2)],
    );
    expect(view.map((e) => e.key)).toEqual(["wip", "new", "done"]);
  });

  test("解放ゲート: 前提カテゴリ未完走のシリーズは除外する", () => {
    const view = buildCollectionCatalogView(
      [
        makeCatalogItem({ key: "base" }),
        makeCatalogItem({ key: "gated", unlockPrerequisiteKey: "base" }),
      ],
      [], // base 未完走
    );
    expect(view.map((e) => e.key)).toEqual(["base"]);
  });

  test("解放ゲート: 前提カテゴリ完走済みなら表示する", () => {
    const view = buildCollectionCatalogView(
      [
        makeCatalogItem({ key: "base" }),
        makeCatalogItem({ key: "gated", unlockPrerequisiteKey: "base" }),
      ],
      [makeProgress("base", 6, true)],
    );
    expect(view.map((e) => e.key).sort()).toEqual(["base", "gated"]);
  });

  test("表示期間が過ぎたコレクションは availability='ended'(集めようと誘わない)", () => {
    const now = new Date("2026-06-22T00:00:00Z");
    const view = buildCollectionCatalogView(
      [
        makeCatalogItem({
          key: "ended",
          collectionDisplayStartsAt: "2026-06-13T11:00:00Z",
          collectionDisplayEndsAt: "2026-06-21T13:00:00Z",
        }),
      ],
      [],
      now,
    );
    expect(view[0]?.availability).toBe("ended");
  });

  test("開始前のコレクションは availability='upcoming'", () => {
    const now = new Date("2026-06-10T00:00:00Z");
    const view = buildCollectionCatalogView(
      [
        makeCatalogItem({
          key: "future",
          collectionDisplayStartsAt: "2026-06-13T11:00:00Z",
          collectionDisplayEndsAt: "2026-06-21T13:00:00Z",
        }),
      ],
      [],
      now,
    );
    expect(view[0]?.availability).toBe("upcoming");
  });

  test("期間内・期間なしは availability='available'", () => {
    const now = new Date("2026-06-15T00:00:00Z");
    const view = buildCollectionCatalogView(
      [
        makeCatalogItem({ key: "noperiod" }),
        makeCatalogItem({
          key: "inperiod",
          collectionDisplayStartsAt: "2026-06-13T11:00:00Z",
          collectionDisplayEndsAt: "2026-06-21T13:00:00Z",
        }),
      ],
      [],
      now,
    );
    expect(view.every((e) => e.availability === "available")).toBe(true);
  });

  test("並び順: 開催中 → 近日 → 終了 → 完成", () => {
    const now = new Date("2026-06-15T00:00:00Z");
    const view = buildCollectionCatalogView(
      [
        makeCatalogItem({
          key: "ended",
          collectionDisplayEndsAt: "2026-06-14T00:00:00Z",
        }),
        makeCatalogItem({
          key: "upcoming",
          collectionDisplayStartsAt: "2026-06-20T00:00:00Z",
        }),
        makeCatalogItem({ key: "available" }),
        makeCatalogItem({ key: "done" }),
      ],
      [makeProgress("done", 6, true)],
      now,
    );
    expect(view.map((e) => e.key)).toEqual([
      "available",
      "upcoming",
      "ended",
      "done",
    ]);
  });

  test("characterImageUrl が無ければ mountTemplateUrl にフォールバック", () => {
    const view = buildCollectionCatalogView(
      [
        makeCatalogItem({
          key: "a",
          characterImageUrl: null,
          mountTemplateUrl: "https://example.com/mount.png",
        }),
      ],
      [],
    );
    expect(view[0]?.imageUrl).toBe("https://example.com/mount.png");
  });
});
