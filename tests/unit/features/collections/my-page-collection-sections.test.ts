/** @jest-environment node */

import {
  buildMyPageCollectionSections,
  remainingOutfits,
  ALMOST_DONE_REMAINING_THRESHOLD,
} from "@/features/collections/lib/my-page-collection-sections";
import type { CollectionProgress } from "@/features/collections/lib/collection-types";

function makeProgress(
  overrides: Partial<CollectionProgress> & { categoryKey: string },
): CollectionProgress {
  const base: CollectionProgress = {
    categoryId: `id-${overrides.categoryKey}`,
    categoryKey: overrides.categoryKey,
    displayNameJa: overrides.categoryKey,
    displayNameEn: overrides.categoryKey,
    completionThreshold: 6,
    uniqueOutfitCount: 0,
    isCompleted: false,
    mountStatus: null,
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
  return { ...base, ...overrides };
}

describe("remainingOutfits", () => {
  test("残り必要数を返す", () => {
    expect(
      remainingOutfits(makeProgress({ categoryKey: "a", uniqueOutfitCount: 4 })),
    ).toBe(2);
  });
  test("超過しても負にならない", () => {
    expect(
      remainingOutfits(
        makeProgress({ categoryKey: "a", uniqueOutfitCount: 8 }),
      ),
    ).toBe(0);
  });
});

describe("buildMyPageCollectionSections", () => {
  test("未着手(0/N かつ未完了)は almostDone/inProgress から除外される", () => {
    const r = buildMyPageCollectionSections([
      makeProgress({ categoryKey: "untouched", uniqueOutfitCount: 0 }),
    ]);
    expect(r.almostDone).toHaveLength(0);
    expect(r.inProgress).toHaveLength(0);
    expect(r.hasEngagement).toBe(false);
    // 看板の分母には未着手も含む(ティーザー)
    expect(r.totalSeries).toBe(1);
    expect(r.completedCount).toBe(0);
  });

  test("残り1〜2着は almostDone に昇格し、それ以外の着手中は inProgress", () => {
    const r = buildMyPageCollectionSections([
      makeProgress({ categoryKey: "almost1", uniqueOutfitCount: 5 }), // 残り1
      makeProgress({ categoryKey: "almost2", uniqueOutfitCount: 4 }), // 残り2
      makeProgress({ categoryKey: "mid", uniqueOutfitCount: 2 }), // 残り4
    ]);
    expect(r.almostDone.map((p) => p.categoryKey)).toEqual(["almost1", "almost2"]);
    expect(r.inProgress.map((p) => p.categoryKey)).toEqual(["mid"]);
    expect(r.hasEngagement).toBe(true);
  });

  test("残り少ない順に並ぶ(同点は着手数の多い順)", () => {
    const r = buildMyPageCollectionSections([
      makeProgress({ categoryKey: "rem4", uniqueOutfitCount: 2 }), // 残り4
      makeProgress({ categoryKey: "rem3", uniqueOutfitCount: 3 }), // 残り3
      makeProgress({
        categoryKey: "rem4b",
        completionThreshold: 10,
        uniqueOutfitCount: 6,
      }), // 残り4 だが着手多い
    ]);
    // 残り3 が先頭、残り4 同点は着手数が多い rem4b が rem4 より先
    expect(r.inProgress.map((p) => p.categoryKey)).toEqual([
      "rem3",
      "rem4b",
      "rem4",
    ]);
  });

  test("完了済みは almostDone/inProgress に出さず、看板の completedCount に数える", () => {
    const r = buildMyPageCollectionSections([
      makeProgress({
        categoryKey: "done",
        uniqueOutfitCount: 6,
        isCompleted: true,
      }),
      makeProgress({ categoryKey: "wip", uniqueOutfitCount: 5 }),
    ]);
    expect(r.almostDone.map((p) => p.categoryKey)).toEqual(["wip"]);
    expect(r.inProgress).toHaveLength(0);
    expect(r.completedCount).toBe(1);
    expect(r.totalSeries).toBe(2);
  });

  test("達成済みだが uniqueOutfitCount が閾値未満でも completed 扱い(進行中に出さない)", () => {
    // mount 完成済み(isCompleted)だが台紙更新前などで count が閾値未満のケース
    const r = buildMyPageCollectionSections([
      makeProgress({
        categoryKey: "edge",
        uniqueOutfitCount: 5,
        isCompleted: true,
      }),
    ]);
    expect(r.almostDone).toHaveLength(0);
    expect(r.inProgress).toHaveLength(0);
    expect(r.completedCount).toBe(1);
    expect(r.hasEngagement).toBe(false);
  });

  test("全着収集済みだが台紙未作成(残り0・未完了)は almostDone に入る(台紙作成へ誘導)", () => {
    const r = buildMyPageCollectionSections([
      makeProgress({
        categoryKey: "ready",
        uniqueOutfitCount: 6,
        isCompleted: false,
      }),
    ]);
    expect(r.almostDone.map((p) => p.categoryKey)).toEqual(["ready"]);
    expect(r.inProgress).toHaveLength(0);
    expect(r.completedCount).toBe(0);
    expect(r.hasEngagement).toBe(true);
  });

  test("看板は完成台紙(別ソース)のカテゴリと union し、N≥M を保証する", () => {
    // 期間終了/ゲートで progress から消えた完成シリーズが完成台紙だけに存在するケース
    const r = buildMyPageCollectionSections(
      [makeProgress({ categoryKey: "wip", uniqueOutfitCount: 5 })],
      ["ended-collab"], // progress に無いが台紙はあるカテゴリ
    );
    // completed は union(progress.isCompleted ∪ 台紙) = 1
    expect(r.completedCount).toBe(1);
    // total は union(progress ∪ completed) = {wip, ended-collab} = 2(必ず completed 以上)
    expect(r.totalSeries).toBe(2);
    expect(r.totalSeries).toBeGreaterThanOrEqual(r.completedCount);
  });

  test("看板 union: 完成台紙カテゴリが progress の isCompleted と重複しても二重計上しない", () => {
    const r = buildMyPageCollectionSections(
      [
        makeProgress({
          categoryKey: "done",
          uniqueOutfitCount: 6,
          isCompleted: true,
        }),
      ],
      ["done"], // 同じカテゴリが台紙にもある
    );
    expect(r.completedCount).toBe(1);
    expect(r.totalSeries).toBe(1);
  });

  test("空配列なら全空・hasEngagement=false", () => {
    const r = buildMyPageCollectionSections([]);
    expect(r).toEqual({
      almostDone: [],
      inProgress: [],
      totalSeries: 0,
      completedCount: 0,
      hasEngagement: false,
    });
  });

  test("ALMOST_DONE_REMAINING_THRESHOLD の境界(残り=閾値はalmost、+1はinProgress)", () => {
    const r = buildMyPageCollectionSections([
      makeProgress({
        categoryKey: "boundary",
        completionThreshold: 10,
        uniqueOutfitCount: 10 - ALMOST_DONE_REMAINING_THRESHOLD,
      }), // 残り=閾値
      makeProgress({
        categoryKey: "over",
        completionThreshold: 10,
        uniqueOutfitCount: 10 - ALMOST_DONE_REMAINING_THRESHOLD - 1,
      }), // 残り=閾値+1
    ]);
    expect(r.almostDone.map((p) => p.categoryKey)).toEqual(["boundary"]);
    expect(r.inProgress.map((p) => p.categoryKey)).toEqual(["over"]);
  });
});
