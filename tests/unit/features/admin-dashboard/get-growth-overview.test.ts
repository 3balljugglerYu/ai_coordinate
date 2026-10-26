/** @jest-environment node */

/**
 * 概要の取得(getGrowthOverview)。ここで守ること:
 *  - 除く人は strict で取り、読めなければ数字を出さない(内部アカウントがまざった数を出さない)
 *  - 集計が1つでも失敗したら、0 を出さずに status: "error" と、失敗したものの名前を返す
 *  - 支払いは運営を除き、本番の支払いだけを、登録した日で新しい人・前からの人に分ける
 *  - 24h のときは、グラフ用の日ごとの出入りを別に取る
 */

jest.mock("server-only", () => ({}));
jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/features/admin-dashboard/lib/get-operator-user-ids", () => ({
  getOperatorUserIds: jest.fn(),
}));
jest.mock("@/features/admin-dashboard/lib/timeline-event-repository", () => ({
  listTimelineEvents: jest.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { getOperatorUserIds } from "@/features/admin-dashboard/lib/get-operator-user-ids";
import { listTimelineEvents } from "@/features/admin-dashboard/lib/timeline-event-repository";
import { getGrowthOverview } from "@/features/admin-dashboard/lib/get-growth-overview";

const mockClient = createAdminClient as jest.MockedFunction<typeof createAdminClient>;
const mockOperators = getOperatorUserIds as jest.MockedFunction<typeof getOperatorUserIds>;
const mockEvents = listTimelineEvents as jest.MockedFunction<typeof listTimelineEvents>;

const NOW = new Date("2026-10-26T12:00:00Z");
const OPERATOR = "99999999-9999-4999-8999-999999999999";
const NEW_PAYER = "11111111-1111-4111-8111-111111111111";
const OLD_PAYER = "22222222-2222-4222-8222-222222222222";

const SUMMARY = {
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
};

const PAYMENTS = [
  // 今の期間・新しく登録した人・本番
  { id: "t1", user_id: NEW_PAYER, amount: 300, transaction_type: "purchase", metadata: { mode: "live", revenueYen: 500 }, created_at: "2026-10-20T00:00:00Z" },
  // 今の期間・前からの人・本番のサブスク
  { id: "t2", user_id: OLD_PAYER, amount: 300, transaction_type: "subscription", metadata: { mode: "live", plan: "light", billingInterval: "month", revenueYen: 980 }, created_at: "2026-10-03T00:00:00Z" },
  // 今の期間・運営(除く)
  { id: "t3", user_id: OPERATOR, amount: 300, transaction_type: "purchase", metadata: { mode: "live", revenueYen: 500 }, created_at: "2026-10-16T00:00:00Z" },
  // 今の期間・テストの支払い(数えない)
  { id: "t4", user_id: OLD_PAYER, amount: 300, transaction_type: "purchase", metadata: { mode: "test", revenueYen: 500 }, created_at: "2026-10-10T00:00:00Z" },
  // 前の期間・前からの人
  { id: "t5", user_id: OLD_PAYER, amount: 300, transaction_type: "subscription", metadata: { mode: "live", plan: "light", billingInterval: "month", revenueYen: 980 }, created_at: "2026-09-03T00:00:00Z" },
];

interface StubOptions {
  failRpc?: string;
  rpcCalls?: Array<{ name: string; args: Record<string, unknown> }>;
}

function stubClient(options: StubOptions = {}) {
  const calls = options.rpcCalls ?? [];
  const rpc = jest.fn((name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    if (name === options.failRpc) {
      return Promise.resolve({ data: null, error: { message: "boom" } });
    }
    const isPrev = args.p_end === "2026-09-26T12:00:00.000Z";
    switch (name) {
      case "get_growth_active_users":
        return Promise.resolve({
          data: [isPrev
            ? { active_users: 33, active_new_users: 9, active_existing_users: 24 }
            : { active_users: 44, active_new_users: 16, active_existing_users: 28 }],
          error: null,
        });
      case "get_percoin_daily_flow":
        return Promise.resolve({
          data: [{ day: "2026-10-25", free_granted: isPrev ? 23683 : 21431, consumed: isPrev ? 17780 : 17380, refunded: isPrev ? 920 : 480, purchased: 300 }],
          error: null,
        });
      case "get_percoin_grant_breakdown":
        return Promise.resolve({ data: [{ source: "streak", grant_count: 1, total_amount: 6135, user_count: 43 }], error: null });
      case "get_percoin_usage_breakdown":
        return Promise.resolve({ data: [{ use_key: "free", consumed: 12690, refunded: 0, paid_consumed: 0, paid_refunded: 0, tx_count: 941 }], error: null });
      case "get_percoin_consumer_summary":
        return Promise.resolve({ data: [SUMMARY], error: null });
      case "get_percoin_low_runway_users":
        return Promise.resolve({ data: [], error: null });
      default:
        return Promise.resolve({ data: null, error: { message: `unexpected ${name}` } });
    }
  });

  const paymentsQuery = {
    select: () => paymentsQuery,
    in: () => paymentsQuery,
    gte: () => paymentsQuery,
    lt: () => paymentsQuery,
    gt: () => paymentsQuery,
    order: () => paymentsQuery,
    limit: () => Promise.resolve({ data: PAYMENTS, error: null }),
  };
  const profilesQuery = {
    select: () => profilesQuery,
    in: (_col: string, ids: string[]) =>
      Promise.resolve({
        data: ids.map((id) => ({
          user_id: id,
          created_at: id === NEW_PAYER ? "2026-10-01T00:00:00Z" : "2026-04-01T00:00:00Z",
        })),
        error: null,
      }),
  };

  return {
    rpc,
    from: (table: string) => (table === "profiles" ? profilesQuery : paymentsQuery),
  } as unknown as ReturnType<typeof createAdminClient>;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  mockOperators.mockResolvedValue([OPERATOR]);
  mockEvents.mockResolvedValue([
    {
      id: "e1",
      eventDate: "2026-10-16",
      kind: "campaign",
      title: "ハロウィン企画を開始",
      note: null,
      createdBy: null,
      createdAt: "2026-10-26T00:00:00Z",
      updatedAt: "2026-10-26T00:00:00Z",
    },
  ]);
});

test("数をまとめ、運営とテストの支払いを除いて、売上を新しい人・前からの人に分ける", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  mockClient.mockReturnValue(stubClient({ rpcCalls: calls }));

  const result = await getGrowthOverview("30d", NOW);

  expect(result.status).toBe("ok");
  if (result.status !== "ok") return;
  expect(mockOperators).toHaveBeenCalledWith({ strict: true });
  expect(result.data.excludedUserCount).toBe(1);
  expect(result.data.tree.current).toMatchObject({
    revenueYen: 1480,
    activeUsers: 44,
    payers: 2,
    newUsers: { payers: 1, revenueYen: 500 },
    existingUsers: { payers: 1, revenueYen: 980 },
  });
  expect(result.data.tree.previous).toMatchObject({ revenueYen: 980, payers: 1, activeUsers: 33 });
  expect(result.data.balance.current.netConsumed).toBe(16900);
  expect(result.data.balance.events).toEqual([
    { eventDate: "2026-10-16", kind: "campaign", title: "ハロウィン企画を開始" },
  ]);
  expect(result.data.answer.finding.kind).toBe("percoin_surplus");
  // 除く人をどの RPC にも渡す
  expect(calls.every((c) => (c.args.p_exclude_user_ids as string[]).includes(OPERATOR))).toBe(true);
  // 30d のグラフの日は今の期間に入っているので、日ごとの出入りは今・前の2回だけ
  expect(calls.filter((c) => c.name === "get_percoin_daily_flow")).toHaveLength(2);
});

test("24h のときは、グラフ用の日ごとの出入りを直近7日(日本時間の 0:00 から)で取り、出来事もその範囲で取る", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  mockClient.mockReturnValue(stubClient({ rpcCalls: calls }));

  await getGrowthOverview("24h", NOW);

  const flows = calls.filter((c) => c.name === "get_percoin_daily_flow");
  expect(flows).toHaveLength(3);
  expect(flows.map((c) => c.args.p_start)).toContain("2026-10-19T15:00:00.000Z");
  expect(mockEvents).toHaveBeenCalledWith({ from: "2026-10-20", to: "2026-10-26" });
});

test("集計が1つ失敗したら、数字を出さずに失敗したものの名前を返す", async () => {
  mockClient.mockReturnValue(stubClient({ failRpc: "get_percoin_consumer_summary" }));

  await expect(getGrowthOverview("30d", NOW)).resolves.toEqual({
    status: "error",
    failed: ["消費した人のまとめ"],
  });
});

test("1行を返すはずの集計が空なら、0 で埋めずに失敗にする", async () => {
  const client = stubClient();
  const rpc = client.rpc as unknown as jest.Mock;
  const original = rpc.getMockImplementation()!;
  rpc.mockImplementation((name: string, args: Record<string, unknown>) =>
    name === "get_growth_active_users" ? Promise.resolve({ data: [], error: null }) : original(name, args),
  );
  mockClient.mockReturnValue(client);

  const result = await getGrowthOverview("30d", NOW);
  expect(result.status).toBe("error");
  if (result.status === "error") {
    expect(result.failed).toEqual(expect.arrayContaining(["使っている人(今)", "使っている人(前)"]));
  }
});

test("除く人を読めなければ、集計を呼ばずに失敗にする", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  mockClient.mockReturnValue(stubClient({ rpcCalls: calls }));
  mockOperators.mockRejectedValue(new Error("analytics_excluded_users の取得に失敗しました"));

  await expect(getGrowthOverview("30d", NOW)).resolves.toEqual({
    status: "error",
    failed: ["集計から除く人"],
  });
  expect(calls).toHaveLength(0);
});

test("出来事の印を読めなくても、失敗として返す(throw しない)", async () => {
  mockClient.mockReturnValue(stubClient());
  mockEvents.mockRejectedValue(new Error("db"));

  await expect(getGrowthOverview("30d", NOW)).resolves.toEqual({
    status: "error",
    failed: ["出来事の印"],
  });
});
