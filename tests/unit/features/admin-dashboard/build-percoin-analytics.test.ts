/** @jest-environment node */

/**
 * ペルコイン配布の集計。
 *
 * 額を下げる判断と、下げた後の効果測定に使う数字なので、
 * 「前期が0のときの増加率」「1日目が0のときの到達率」といった
 * 割り算の端で嘘の数字（Infinity や NaN）を出さないことを固定する。
 */

import {
  buildPercoinAnalytics,
  labelForGrantSource,
} from "@/features/admin-dashboard/lib/build-percoin-analytics";

const EMPTY = {
  currentGrants: [],
  previousGrants: [],
  streakReach: [],
  previousStreakReach: [],
  checkinReach: null,
  distribution: null,
  operatorExcludedCount: 0,
};

describe("buildPercoinAnalytics", () => {
  test("配布額の多い順に並べ、構成比と前期比を出す", () => {
    const result = buildPercoinAnalytics({
      ...EMPTY,
      currentGrants: [
        { source: "daily_post_free", grant_count: 10, total_amount: 200, user_count: 5 },
        { source: "streak", grant_count: 50, total_amount: 800, user_count: 20 },
      ],
      previousGrants: [
        { source: "streak", grant_count: 40, total_amount: 400, user_count: 18 },
      ],
    });

    expect(result.grants.map((g) => g.source)).toEqual([
      "streak",
      "daily_post_free",
    ]);
    expect(result.totalGranted).toBe(1000);
    expect(result.grants[0]?.sharePercent).toBe(80);
    // 400 → 800 なので +100%
    expect(result.grants[0]?.changePercent).toBe(100);
  });

  test("前期が0の付与元は増加率を出さない", () => {
    const result = buildPercoinAnalytics({
      ...EMPTY,
      currentGrants: [
        { source: "prompt_use_bonus", grant_count: 1, total_amount: 20, user_count: 1 },
      ],
    });

    // 0 から増えた分の「割合」は定義できない。Infinity% を出さない
    expect(result.grants[0]?.changePercent).toBeNull();
    expect(result.totalChangePercent).toBeNull();
  });

  test("連続ログインの到達率は1日目を分母にする", () => {
    const result = buildPercoinAnalytics({
      ...EMPTY,
      streakReach: [
        { streak_day: 1, user_count: 42 },
        { streak_day: 2, user_count: 29 },
        { streak_day: 14, user_count: 10 },
      ],
    });

    expect(result.streakReach[0]?.reachPercent).toBe(100);
    expect(result.streakReach[1]?.reachPercent).toBe(69);
    expect(result.streakReach[13]?.reachPercent).toBe(23.8);
    // 1日目→2日目の離脱率
    expect(result.streakFirstDropPercent).toBe(31);
  });

  test("1日目が0でも到達率で落ちない", () => {
    const result = buildPercoinAnalytics({ ...EMPTY, streakReach: [] });

    // 0除算で NaN を表に出さないこと
    expect(result.streakReach).toHaveLength(14);
    expect(result.streakReach[0]?.reachPercent).toBe(0);
    expect(result.streakFirstDropPercent).toBeNull();
  });

  test("14日ぶんの行を必ず返す（データが飛んでいても欠番にしない）", () => {
    const result = buildPercoinAnalytics({
      ...EMPTY,
      streakReach: [{ streak_day: 1, user_count: 10 }],
    });

    expect(result.streakReach.map((r) => r.day)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
    ]);
    expect(result.streakReach[5]?.userCount).toBe(0);
  });

  test("チェックインは押していない人数も出す", () => {
    const result = buildPercoinAnalytics({
      ...EMPTY,
      checkinReach: { signup_count: 37, checked_in_count: 16 },
    });

    expect(result.checkin.reachPercent).toBe(43.2);
    expect(result.checkin.notCheckedInCount).toBe(21);
  });

  test("新規登録が0なら到達率は出さない", () => {
    const result = buildPercoinAnalytics({
      ...EMPTY,
      checkinReach: { signup_count: 0, checked_in_count: 0 },
    });

    expect(result.checkin.reachPercent).toBeNull();
  });

  test("保有分布が取れなくても形を保つ", () => {
    const result = buildPercoinAnalytics(EMPTY);

    expect(result.distribution.holderCount).toBe(0);
    expect(result.distribution.medianBalance).toBeNull();
  });

  test("旧・生成方法の区別なしの投稿ボーナスは(旧)と分かる名前にする", () => {
    // 「いまも区別せず配っている」と読めると、額の見直しを誤る
    expect(labelForGrantSource("daily_post")).toContain("旧");
    expect(labelForGrantSource("daily_post_one_tap")).toBe(
      "投稿ボーナス（ワンタップ）"
    );
  });

  test("未知の付与元はそのまま出す（黙って消さない）", () => {
    expect(labelForGrantSource("brand_new_bonus")).toBe("brand_new_bonus");
  });
});
