/**
 * 概要の組み立て(売上のツリー・ペルコインの釣り合い・今週の答え・グラフの範囲)。
 *
 * どれも画面にそのまま出る数と言葉なので、ずれても落ちない。
 * 2026-10-26 の実データ(直近30日)に近い数で、見本どおりになることを固定する。
 */

import { buildPercoinBalance, sumDailyFlow } from "@/features/admin-dashboard/lib/build-percoin-balance";
import { buildRevenueTree, ratePct } from "@/features/admin-dashboard/lib/build-revenue-tree";
import { buildWeeklyAnswer } from "@/features/admin-dashboard/lib/build-weekly-answer";
import { getChartRange } from "@/features/admin-dashboard/lib/chart-range";
import { startOfJstDay } from "@/features/admin-dashboard/lib/dashboard-range";
import type {
  PercoinConsumerSummaryRow,
  PercoinDailyFlowRow,
} from "@/features/admin-dashboard/lib/growth-overview-types";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const active = (all: number, newUsers: number) => ({
  active_users: all,
  active_new_users: newUsers,
  active_existing_users: all - newUsers,
});

const summary = (patch: Partial<PercoinConsumerSummaryRow> = {}): PercoinConsumerSummaryRow => ({
  consumer_count: 44,
  total_consumed_net: 16900,
  top_count: 10,
  top_consumed_net: 13020,
  top_free_granted: 13290,
  runway_le3: 5,
  runway_3_7: 2,
  runway_7_30: 11,
  runway_30_90: 14,
  runway_gt90: 11,
  non_positive_count: 1,
  ...patch,
});

const flow = (free: number, consumed: number, refunded = 0, purchased = 0): PercoinDailyFlowRow[] => [
  { day: "2026-10-25", free_granted: free, consumed, refunded, purchased },
];

function balanceOf(free: number, consumed: number, refunded = 0) {
  return buildPercoinBalance({
    currentFlow: flow(free, consumed, refunded),
    previousFlow: flow(23683, 17780, 920),
    chartFlow: flow(free, consumed, refunded),
    grants: [],
    usage: [],
    summary: summary(),
    lowRunway: [],
    lowRunwayLimit: 50,
    events: [],
  });
}

describe("ratePct", () => {
  test("小数1桁の%・分母0は null(0% にしない)", () => {
    expect(ratePct(1, 43)).toBe(2.3);
    expect(ratePct(0, 0)).toBeNull();
  });
});

describe("buildRevenueTree", () => {
  test("売上・使っている人・課金した人の割合・1人あたりを、新しい人と前からの人に分ける", () => {
    const tree = buildRevenueTree({
      current: { active: active(43, 16), payments: [{ userId: A, yen: 980, isNewUser: false }] },
      previous: { active: active(33, 9), payments: [{ userId: A, yen: 980, isNewUser: false }] },
    });
    expect(tree.current).toMatchObject({
      revenueYen: 980,
      activeUsers: 43,
      payers: 1,
      payerRatePct: 2.3,
      revenuePerPayerYen: 980,
      newUsers: { activeUsers: 16, payers: 0, revenueYen: 0, payerRatePct: 0 },
      existingUsers: { activeUsers: 27, payers: 1, revenueYen: 980, payerRatePct: 3.7 },
    });
    expect(tree.previous.payerRatePct).toBe(3);
  });

  test("同じ人の2回の支払いは、課金した人1人・売上は合計", () => {
    const tree = buildRevenueTree({
      current: {
        active: active(30, 0),
        payments: [
          { userId: A, yen: 500, isNewUser: false },
          { userId: A, yen: 980, isNewUser: false },
          { userId: B, yen: 500, isNewUser: true },
        ],
      },
      previous: { active: active(0, 0), payments: [] },
    });
    expect(tree.current.payers).toBe(2);
    expect(tree.current.revenueYen).toBe(1980);
    expect(tree.current.revenuePerPayerYen).toBe(990);
    expect(tree.current.newUsers.payers).toBe(1);
  });

  test("使っている人・課金した人が0なら、割合と1人あたりは null", () => {
    const tree = buildRevenueTree({
      current: { active: active(0, 0), payments: [] },
      previous: { active: active(0, 0), payments: [] },
    });
    expect(tree.current.payerRatePct).toBeNull();
    expect(tree.current.revenuePerPayerYen).toBeNull();
  });
});

describe("sumDailyFlow / buildPercoinBalance", () => {
  test("使った量は消費 − 返金(正味)", () => {
    expect(sumDailyFlow(flow(21431, 17380, 480, 300))).toEqual({
      freeGranted: 21431,
      consumed: 17380,
      refunded: 480,
      netConsumed: 16900,
      purchased: 300,
    });
  });

  test("配った元からは、購入・サブスク・返金を外し、多い順に並べる", () => {
    const b = buildPercoinBalance({
      currentFlow: flow(100, 50),
      previousFlow: flow(0, 0),
      chartFlow: flow(100, 50),
      grants: [
        { source: "streak", grant_count: 5, total_amount: 30, user_count: 3 },
        { source: "daily_post_free", grant_count: 2, total_amount: 70, user_count: 2 },
        { source: "purchase", grant_count: 1, total_amount: 500, user_count: 1 },
        { source: "subscription", grant_count: 1, total_amount: 300, user_count: 1 },
        { source: "refund", grant_count: 1, total_amount: 20, user_count: 1 },
      ],
      usage: [
        { use_key: "free", consumed: 40, refunded: 0, paid_consumed: 10, paid_refunded: 0, tx_count: 4 },
        { use_key: "failed_job", consumed: 20, refunded: 20, paid_consumed: 10, paid_refunded: 10, tx_count: 1 },
        { use_key: "one_tap_style", consumed: 10, refunded: 0, paid_consumed: 0, paid_refunded: 0, tx_count: 1 },
      ],
      summary: summary(),
      lowRunway: [],
      lowRunwayLimit: 50,
      events: [],
    });
    expect(b.freeBySource.map((s) => s.key)).toEqual(["daily_post_free", "streak"]);
    // 失敗した生成は正味0なので出さない
    expect(b.usageByKind.map((u) => [u.key, u.amount])).toEqual([
      ["free", 40],
      ["one_tap_style", 10],
    ]);
    // 有料分も返金を引いた正味
    expect(b.paidNetConsumed).toBe(10);
  });

  test("配った ÷ 使った・上位10人の割合(100% を超えうる)", () => {
    const b = balanceOf(21431, 17380, 480);
    expect(b.freeToNetRatio).toBe(1.27);
    expect(b.topConsumers.shareOfTotalPct).toBe(77);
    expect(b.topConsumers.selfFundedPct).toBe(102.1);
    expect(b.runway.map((r) => r.users)).toEqual([5, 2, 11, 14, 11]);
    expect(b.runway.filter((r) => r.low).map((r) => r.key)).toEqual(["le3", "3_7"]);
  });

  test("使った量が0なら、配った ÷ 使った は null", () => {
    expect(balanceOf(100, 0).freeToNetRatio).toBeNull();
  });

  test("残りが少ない人は上限までにし、上限 + 1 件あれば「ほかにもいる」", () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      user_id: `u${i}`,
      nickname: `n${i}`,
      balance: 10,
      consumed_net: 100,
      days_left: 0.5,
    }));
    const make = (limit: number) =>
      buildPercoinBalance({
        currentFlow: flow(0, 1),
        previousFlow: flow(0, 0),
        chartFlow: flow(0, 1),
        grants: [],
        usage: [],
        summary: summary(),
        lowRunway: rows,
        lowRunwayLimit: limit,
        events: [],
      });
    expect(make(2).lowRunwayUsers).toHaveLength(2);
    expect(make(2).lowRunwayHasMore).toBe(true);
    expect(make(3).lowRunwayHasMore).toBe(false);
  });
});

describe("buildWeeklyAnswer", () => {
  const tree = (cur: number, prev: number, curPayers: number, prevPayers: number) =>
    buildRevenueTree({
      current: {
        active: active(cur, 0),
        payments: Array.from({ length: curPayers }, (_, i) => ({ userId: `c${i}`, yen: 500, isNewUser: false })),
      },
      previous: {
        active: active(prev, 0),
        payments: Array.from({ length: prevPayers }, (_, i) => ({ userId: `p${i}`, yen: 500, isNewUser: false })),
      },
    });

  test("使っている人が30人未満なら「まだ判断できません」", () => {
    const a = buildWeeklyAnswer({ tree: tree(29, 40, 0, 0), balance: balanceOf(100, 10) });
    expect(a.finding.kind).toBe("insufficient_sample");
  });

  test("ちょうど30人なら判断する", () => {
    const a = buildWeeklyAnswer({ tree: tree(30, 40, 0, 0), balance: balanceOf(100, 10) });
    expect(a.finding.kind).toBe("percoin_surplus");
  });

  test("配った量 ≥ 使った量(正味)なら「ペルコインが足りなくならない」と、見る数字を3つ", () => {
    const a = buildWeeklyAnswer({ tree: tree(43, 33, 1, 1), balance: balanceOf(21431, 17380, 480) });
    expect(a.finding.kind).toBe("percoin_surplus");
    expect(a.finding.title).toBe("ペルコインが足りなくならない");
    expect(a.finding.watch).toEqual([
      "配った量 ÷ 使った量(今 1.27)",
      "残りが3日以内の人(今 5人)",
      "課金した人の割合(今 2.3%)",
    ]);
  });

  test("返金を引くと配る方が多くなる場合も、正味で判断する", () => {
    // 消費 1,000・返金 200 → 正味 800。配った 900 は正味以上
    const a = buildWeeklyAnswer({ tree: tree(40, 40, 0, 0), balance: balanceOf(900, 1000, 200) });
    expect(a.finding.kind).toBe("percoin_surplus");
  });

  test("使った量(正味)が0でも、配っていれば「足りなくならない」", () => {
    // 全部が返金された期間(消費 300・返金 300)
    const a = buildWeeklyAnswer({ tree: tree(40, 40, 0, 0), balance: balanceOf(5000, 300, 300) });
    expect(a.finding.kind).toBe("percoin_surplus");
  });

  test("配っても使ってもいなければ、足りなくならない とは言わない", () => {
    const a = buildWeeklyAnswer({ tree: tree(40, 40, 0, 0), balance: balanceOf(0, 0) });
    expect(a.finding.kind).not.toBe("percoin_surplus");
  });

  test("足りている状態で、課金した人の割合が下がったら、それを直し所にする", () => {
    const a = buildWeeklyAnswer({ tree: tree(40, 40, 1, 2), balance: balanceOf(100, 500) });
    expect(a.finding.kind).toBe("payer_rate_down");
  });

  test("課金した人の割合は丸める前の値で比べる(どちらも 3.0% と出る場合でも、下がったと分かる)", () => {
    // 前 2/66 = 3.03% → 3.0%、今 3/100 = 3.00% → 3.0%
    const t = tree(100, 66, 3, 2);
    expect(t.current.payerRatePct).toBe(t.previous.payerRatePct);
    const a = buildWeeklyAnswer({ tree: t, balance: balanceOf(100, 500) });
    expect(a.finding.kind).toBe("payer_rate_down");
  });

  test("前の期間が30人未満なら、前と比べず、そのことを書く", () => {
    const a = buildWeeklyAnswer({ tree: tree(40, 20, 1, 2), balance: balanceOf(100, 500) });
    expect(a.finding.kind).toBe("no_bottleneck");
    expect(a.notes).toEqual([
      "前の期間の使っている人が20人(30人未満)なので、前の期間とは比べていません",
    ]);
  });

  test("課金した人の割合が同じで、使っている人が減ったら、それを直し所にする", () => {
    const a = buildWeeklyAnswer({ tree: tree(40, 50, 4, 5), balance: balanceOf(100, 500) });
    expect(a.finding.kind).toBe("active_users_down");
  });

  test("どれでもなければ「大きな詰まりは見つかりません」", () => {
    const a = buildWeeklyAnswer({ tree: tree(50, 40, 5, 4), balance: balanceOf(100, 500) });
    expect(a.finding.kind).toBe("no_bottleneck");
  });

  test("売上の見出しに、前の期間との差と、新しい人・前からの人の内訳を書く", () => {
    const a = buildWeeklyAnswer({ tree: tree(43, 33, 1, 1), balance: balanceOf(21431, 17380, 480) });
    expect(a.revenue.headline).toBe("500円(前の期間 500円・±0)");
    expect(a.revenue.detail).toBe(
      "新しく登録した人から 0円(0人)・前から使っている人から 500円(1人)",
    );
  });
});

describe("getChartRange", () => {
  // 2026-10-26 21:00 JST
  const now = new Date("2026-10-26T12:00:00Z");

  test.each([
    ["24h", "2026-10-19T15:00:00.000Z", 7],
    ["7d", "2026-10-19T15:00:00.000Z", 7],
    ["30d", "2026-09-26T15:00:00.000Z", 30],
    ["90d", "2026-07-28T15:00:00.000Z", 90],
  ] as const)("%s は今日を含めて N日。始まりは日本時間の 0:00", (range, start, days) => {
    const chart = getChartRange(range, now);
    expect(chart.start.toISOString()).toBe(start);
    expect(chart.end).toBe(now);
    expect(chart.days).toBe(days);
  });

  test("日本時間の 0:00 ちょうどは、その日の始まり", () => {
    expect(startOfJstDay(new Date("2026-10-25T15:00:00Z")).toISOString()).toBe(
      "2026-10-25T15:00:00.000Z",
    );
    expect(startOfJstDay(new Date("2026-10-25T14:59:59Z")).toISOString()).toBe(
      "2026-10-24T15:00:00.000Z",
    );
  });
});
