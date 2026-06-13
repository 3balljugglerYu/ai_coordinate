import { buildCollectionUuFunnel } from "@/features/admin-dashboard/lib/build-collection-uu-funnel";

describe("buildCollectionUuFunnel", () => {
  test("UU の歩留まり・到達率・離脱を算出する", () => {
    const f = buildCollectionUuFunnel({
      generateMemberUserIds: ["u1", "u2", "u3", "u3"], // distinct 3
      completerUserIds: ["u1", "u2"], // 2
      shareUserIds: ["u1"], // 1
      registeredUserIds: ["u2", "u4"], // 期間内登録 2
    });

    expect(f.generatesUu).toBe(3);
    expect(f.completionsUu).toBe(2);
    expect(f.sharesUu).toBe(1);
    expect(f.reachRatePct).toBe(66.7); // 2/3
    expect(f.registeredUu).toBe(2);
    expect(f.registeredCompletedUu).toBe(1); // u2 ∈ completers ∩ registered
    expect(f.registeredReachRatePct).toBe(50); // 1/2
    expect(f.registeredNotCompletedUu).toBe(1); // u4
    expect(f.completedNotSharedUu).toBe(1); // u2 はコンプリートしたが未シェア
  });

  test("分母0は到達率を N/A(null) にする", () => {
    const f = buildCollectionUuFunnel({
      generateMemberUserIds: [],
      completerUserIds: [],
      shareUserIds: [],
      registeredUserIds: [],
    });

    expect(f.generatesUu).toBe(0);
    expect(f.reachRatePct).toBeNull();
    expect(f.registeredReachRatePct).toBeNull();
    expect(f.registeredNotCompletedUu).toBe(0);
    expect(f.completedNotSharedUu).toBe(0);
  });

  test("null/空文字の user_id は除外して distinct 集計する", () => {
    const f = buildCollectionUuFunnel({
      generateMemberUserIds: ["u1", "", "u1"],
      completerUserIds: ["u1"],
      shareUserIds: [],
      registeredUserIds: [],
    });

    expect(f.generatesUu).toBe(1);
    expect(f.completionsUu).toBe(1);
  });
});
