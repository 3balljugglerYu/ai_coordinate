/** @jest-environment node */

/**
 * 表示用の付与額が、予約の切替を反映しているか。
 *
 * ここが `amount` の直読みに戻ると、切替後に「ミッション一覧は20と言っているのに
 * 実際は10しか入らない」というズレになる。付与側(DB関数)は切替済みの額を使うため、
 * 表示だけが取り残される形で、利用者からは嘘に見える。
 */

jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));

import { getPercoinDefaultsForDisplay } from "@/features/credits/lib/get-percoin-defaults";
import { createAdminClient } from "@/lib/supabase/admin";

const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;

const PAST = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();

type Row = Record<string, unknown>;

function mockTables(bonusRows: Row[], streakRows: Row[]) {
  mockCreateAdminClient.mockReturnValue({
    from: (table: string) => {
      const data = table === "percoin_bonus_defaults" ? bonusRows : streakRows;
      const builder = {
        select: () => builder,
        in: () => Promise.resolve({ data, error: null }),
        order: () => Promise.resolve({ data, error: null }),
      };
      return builder;
    },
  } as never);
}

function streak14(overrides: Row = {}): Row[] {
  return Array.from({ length: 14 }, (_, i) => ({
    streak_day: i + 1,
    amount: 10,
    scheduled_amount: null,
    scheduled_at: null,
    ...(i + 1 === 14 ? { amount: 100, ...overrides } : {}),
  }));
}

describe("getPercoinDefaultsForDisplay と予約", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("切替日時を過ぎた予約は表示にも反映する", async () => {
    mockTables(
      [
        {
          source: "daily_post_free",
          amount: 20,
          scheduled_amount: 10,
          scheduled_at: PAST,
        },
        {
          source: "daily_post_one_tap",
          amount: 20,
          scheduled_amount: null,
          scheduled_at: null,
        },
      ],
      streak14()
    );

    const result = await getPercoinDefaultsForDisplay();

    // フリー(切替済み10) + ワンタップ(20) = 30
    expect(result.dailyPostBonusAmount).toBe(30);
  });

  test("切替前の予約は現在額のまま", async () => {
    mockTables(
      [
        {
          source: "daily_post_free",
          amount: 20,
          scheduled_amount: 10,
          scheduled_at: FUTURE,
        },
        {
          source: "daily_post_one_tap",
          amount: 20,
          scheduled_amount: null,
          scheduled_at: null,
        },
      ],
      streak14()
    );

    const result = await getPercoinDefaultsForDisplay();

    expect(result.dailyPostBonusAmount).toBe(40);
  });

  test("連続ログインの予約も反映する", async () => {
    mockTables(
      [],
      streak14({ scheduled_amount: 50, scheduled_at: PAST })
    );

    const result = await getPercoinDefaultsForDisplay();

    expect(result.streakBonusSchedule[13]).toBe(50);
  });

  test("還元の予約も反映する", async () => {
    mockTables(
      [
        {
          source: "prompt_usage_reward",
          amount: 2,
          scheduled_amount: 0,
          scheduled_at: PAST,
        },
      ],
      streak14()
    );

    const result = await getPercoinDefaultsForDisplay();

    // 0 への切替（= 停止）も正しく反映されること
    expect(result.promptUsageRewardAmount).toBe(0);
  });
});
