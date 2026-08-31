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
  previousCheckinReach: null,
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

  test("到達率の母数は day1 の人数ではなく「到達しうる人」", () => {
    /*
      開始から日が浅い人を母数に入れると、続けているのに脱落したように見える。
      day14 は 34人が到達しうるうち 10人 = 29.4%。42人を分母にすると 23.8% と
      低く出て、減額の影響と区別がつかなくなる。
    */
    const result = buildPercoinAnalytics({
      ...EMPTY,
      streakReach: [
        { streak_day: 1, user_count: 42, eligible_count: 42 },
        { streak_day: 2, user_count: 29, eligible_count: 41 },
        { streak_day: 14, user_count: 10, eligible_count: 34 },
      ],
    });

    expect(result.streakReach[0]?.reachPercent).toBe(100);
    expect(result.streakReach[1]?.reachPercent).toBe(70.7);
    expect(result.streakReach[13]?.reachPercent).toBe(29.4);
    expect(result.streakReach[13]?.eligibleCount).toBe(34);
    // 2日目まで続かなかった割合
    expect(result.streakFirstDropPercent).toBe(29.3);
  });

  test("母数0の日は 0% ではなく null（未到達期と区別する）", () => {
    /*
      「まだ誰も到達しうる時期に来ていない」を 0% と出すと、
      継続がゼロだったと誤読される。24h 表示で必ず起きる。
    */
    const result = buildPercoinAnalytics({
      ...EMPTY,
      streakReach: [
        { streak_day: 1, user_count: 5, eligible_count: 5 },
        { streak_day: 14, user_count: 0, eligible_count: 0 },
      ],
    });

    expect(result.streakReach[0]?.reachPercent).toBe(100);
    expect(result.streakReach[13]?.reachPercent).toBeNull();
  });

  test("データが空でも 0% を作らない", () => {
    const result = buildPercoinAnalytics({ ...EMPTY, streakReach: [] });

    expect(result.streakReach).toHaveLength(14);
    expect(result.streakReach[0]?.reachPercent).toBeNull();
    expect(result.streakFirstDropPercent).toBeNull();
  });

  test("14日ぶんの行を必ず返す（データが飛んでいても欠番にしない）", () => {
    const result = buildPercoinAnalytics({
      ...EMPTY,
      streakReach: [{ streak_day: 1, user_count: 10, eligible_count: 10 }],
    });

    expect(result.streakReach.map((r) => r.day)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
    ]);
    expect(result.streakReach[5]?.userCount).toBe(0);
  });

  test("チェックインは押していない人数と前期比も出す", () => {
    const result = buildPercoinAnalytics({
      ...EMPTY,
      checkinReach: { signup_count: 37, checked_in_count: 16 },
      previousCheckinReach: { signup_count: 40, checked_in_count: 14 },
    });

    expect(result.checkin.reachPercent).toBe(43.2);
    expect(result.checkin.notCheckedInCount).toBe(21);
    expect(result.checkin.previousReachPercent).toBe(35);
    // 率の差なので % ではなく pt
    expect(result.checkin.reachPointDiff).toBe(8.2);
  });

  test("前期の新規が0ならチェックインの前期比は出さない", () => {
    const result = buildPercoinAnalytics({
      ...EMPTY,
      checkinReach: { signup_count: 10, checked_in_count: 5 },
      previousCheckinReach: { signup_count: 0, checked_in_count: 0 },
    });

    expect(result.checkin.previousReachPercent).toBeNull();
    expect(result.checkin.reachPointDiff).toBeNull();
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
