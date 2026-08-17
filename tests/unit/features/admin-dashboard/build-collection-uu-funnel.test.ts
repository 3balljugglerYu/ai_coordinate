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

  test("viewer_key でゲスト訪問UU・ゲスト生成UUと転換率を出す", () => {
    const f = buildCollectionUuFunnel({
      // 同一 IP ハッシュは1人として数える(端末/回線単位の近似)
      visitMemberViewerKeys: ["u:u1", "u:u2", "u:u1"],
      visitGuestViewerKeys: ["g:aaa", "g:bbb", "g:aaa", "g:ccc", "g:ddd"],
      generateGuestViewerKeys: ["g:aaa", "g:aaa"],
      generateMemberUserIds: ["u1"],
      completerUserIds: [],
      shareUserIds: [],
      registeredUserIds: [],
    });

    expect(f.visitsMemberUu).toBe(2);
    expect(f.visitsGuestUu).toBe(4);
    expect(f.generatesGuestUu).toBe(1);
    expect(f.guestGenerateRatePct).toBe(25); // 1/4
  });

  test("計装前(viewer_key が null)は訪問UUを0にし、率は N/A にする", () => {
    const f = buildCollectionUuFunnel({
      // 2026-08-17 の計装より前の行は viewer_key を持たない。
      // 「0人が訪問した」ではなく「取れていない」ので率は出さない。
      visitMemberViewerKeys: [null, null],
      visitGuestViewerKeys: [null, null, null],
      generateGuestViewerKeys: [null],
      generateMemberUserIds: ["u1"],
      completerUserIds: ["u1"],
      shareUserIds: [],
      registeredUserIds: [],
    });

    expect(f.visitsMemberUu).toBe(0);
    expect(f.visitsGuestUu).toBe(0);
    expect(f.generatesGuestUu).toBe(0);
    expect(f.guestGenerateRatePct).toBeNull();
  });

  test("訪問系を渡さなくても既存の集計は壊れない(後方互換)", () => {
    const f = buildCollectionUuFunnel({
      generateMemberUserIds: ["u1", "u2"],
      completerUserIds: ["u1"],
      shareUserIds: [],
      registeredUserIds: [],
    });

    expect(f.visitsMemberUu).toBe(0);
    expect(f.guestGenerateRatePct).toBeNull();
    expect(f.generatesUu).toBe(2);
    expect(f.reachRatePct).toBe(50);
  });
});
