/** @jest-environment node */

/**
 * ダッシュボードの登録した経路(signup_source)は、運営だけが読む user_signup_sources から読み、
 * profiles の行に user_id で合わせる(だれでも読める profiles からは読まない)。
 *
 * ここで守ること:
 *  - profiles からは signup_source を読まない
 *  - user_signup_sources の経路が profiles の行に合わさり、One-Tap Style の「保存経由の新規登録数」に数えられる
 *  - user_signup_sources は 1000 行ずつ user_id で送って全部読む
 */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

import { getAdminDashboardData } from "@/features/admin-dashboard/lib/get-admin-dashboard-data";
import { createAdminClient } from "@/lib/supabase/admin";

const mockCreateAdminClient = createAdminClient as jest.MockedFunction<typeof createAdminClient>;

type Call = [string, unknown[]];

/** 表ごとに結果を返すクライアント。signupSourcePages は呼ばれた順に1ページずつ返す */
function mockClient(params: {
  profiles: Array<Record<string, unknown>>;
  signupSourcePages: Array<Array<Record<string, unknown>>>;
}) {
  const calls: Record<string, Call[]> = {};
  let signupSourcePage = 0;

  const builder = (table: string) => {
    calls[table] ??= [];
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "gte", "lte", "gt", "eq", "neq", "not", "in", "order", "limit"]) {
      chain[method] = (...args: unknown[]) => {
        calls[table].push([method, args]);
        return chain;
      };
    }
    chain.then = (resolve: (value: unknown) => unknown) => {
      if (table === "profiles") {
        return resolve({ data: params.profiles, error: null, count: 0 });
      }
      if (table === "user_signup_sources") {
        const data = params.signupSourcePages[signupSourcePage] ?? [];
        signupSourcePage += 1;
        return resolve({ data, error: null, count: 0 });
      }
      return resolve({ data: [], error: null, count: 0 });
    };
    return chain;
  };

  mockCreateAdminClient.mockReturnValue({
    from: (table: string) => builder(table),
    rpc: () => Promise.resolve({ data: [], error: null }),
  } as never);

  return { calls };
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

function wardrobeSignups(result: Awaited<ReturnType<typeof getAdminDashboardData>>) {
  return result.oneTapStyle.summary.metrics.find((metric) => metric.key === "wardrobeSignups")?.currentCount;
}

describe("getAdminDashboardData の登録した経路", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("user_signup_sources の経路を profiles の行に合わせて数え、profiles からは経路を読まない", async () => {
    const { calls } = mockClient({
      profiles: [
        { user_id: "u-wardrobe", nickname: "a", created_at: hoursAgo(2) },
        { user_id: "u-none", nickname: "b", created_at: hoursAgo(3) },
      ],
      signupSourcePages: [[{ id: "u-wardrobe", signup_source: "wardrobe" }]],
    });

    const result = await getAdminDashboardData("30d");

    expect(wardrobeSignups(result)).toBe(1);
    const profileSelects = calls.profiles
      .filter(([method]) => method === "select")
      .map(([, args]) => String(args[0]));
    expect(profileSelects.some((columns) => columns.includes("signup_source"))).toBe(false);
  });

  test("user_signup_sources は 1000 行ずつ user_id で送って全部読む", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, i) => ({
      id: `u-${String(i).padStart(4, "0")}`,
      signup_source: "style",
    }));
    const { calls } = mockClient({
      profiles: [{ user_id: "u-last", nickname: "c", created_at: hoursAgo(1) }],
      signupSourcePages: [firstPage, [{ id: "u-last", signup_source: "wardrobe" }]],
    });

    const result = await getAdminDashboardData("30d");

    expect(calls.user_signup_sources).toEqual(
      expect.arrayContaining([
        ["gt", ["user_id", "u-0999"]],
        ["order", ["user_id", { ascending: true }]],
      ]),
    );
    expect(wardrobeSignups(result)).toBe(1);
  });
});
