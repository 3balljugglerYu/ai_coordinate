/** @jest-environment node */

/**
 * 付与額の予約（PATCH /api/admin/percoin-defaults）。
 *
 * この API が守るのは3つ。
 *  - 過去の切替日時を保存させない（保存した瞬間に効いてしまう）
 *  - 予約額にも現在額と同じ範囲を課す（切替の瞬間に許容外の額で配り始める）
 *  - 額と日時が必ず揃う（片方だけの予約は意味を持たない）
 */

jest.mock("@/lib/auth", () => ({ requireAdmin: jest.fn() }));
jest.mock("@/lib/admin-audit", () => ({ logAdminAction: jest.fn() }));
jest.mock("@/lib/supabase/admin", () => ({ createAdminClient: jest.fn() }));
jest.mock("next/cache", () => ({ revalidateTag: jest.fn() }));

import type { NextRequest } from "next/server";
import { PATCH } from "@/app/api/admin/percoin-defaults/route";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;

/** upsert 呼び出しを記録するモック。 */
function mockSupabase() {
  const calls: Array<{ table: string; rows: unknown }> = [];
  mockCreateAdminClient.mockReturnValue({
    from: (table: string) => ({
      upsert: (rows: unknown) => {
        calls.push({ table, rows });
        return Promise.resolve({ error: null });
      },
    }),
  } as never);
  return calls;
}

/** 1〜14日ぶんの streak を作る（API が全日を要求するため）。 */
function streakRows(
  override: Partial<Record<number, Record<string, unknown>>> = {}
) {
  return Array.from({ length: 14 }, (_, i) => ({
    streak_day: i + 1,
    amount: 10,
    ...(override[i + 1] ?? {}),
  }));
}

function buildRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/admin/percoin-defaults", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 60 * 1000).toISOString();

describe("PATCH /api/admin/percoin-defaults の予約", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ id: "admin-1" } as never);
  });

  test("予約を保存できる", async () => {
    const calls = mockSupabase();

    const response = await PATCH(
      buildRequest({
        bonusDefaults: [
          {
            source: "daily_post_free",
            amount: 20,
            scheduled_amount: 10,
            scheduled_at: FUTURE,
          },
        ],
        streakDefaults: streakRows({
          14: { amount: 100, scheduled_amount: 50, scheduled_at: FUTURE },
        }),
      })
    );

    expect(response.status).toBe(200);
    const bonusRows = calls.find((c) => c.table === "percoin_bonus_defaults")
      ?.rows as Array<Record<string, unknown>>;
    expect(bonusRows[0]).toMatchObject({
      source: "daily_post_free",
      amount: 20,
      scheduled_amount: 10,
      scheduled_at: FUTURE,
    });
  });

  test("過去の切替日時は 400", async () => {
    mockSupabase();

    const response = await PATCH(
      buildRequest({
        bonusDefaults: [
          {
            source: "daily_post_free",
            amount: 20,
            scheduled_amount: 10,
            scheduled_at: PAST,
          },
        ],
        streakDefaults: streakRows(),
      })
    );

    expect(response.status).toBe(400);
  });

  test("予約額が source の範囲外なら 400", async () => {
    mockSupabase();

    // 還元は上限5。切替の瞬間に上限を超えた額で配り始めるのを防ぐ
    const response = await PATCH(
      buildRequest({
        bonusDefaults: [
          {
            source: "prompt_usage_reward",
            amount: 2,
            scheduled_amount: 100,
            scheduled_at: FUTURE,
          },
        ],
        streakDefaults: streakRows(),
      })
    );

    expect(response.status).toBe(400);
  });

  test("額だけ・日時だけの予約は 400", async () => {
    mockSupabase();

    const onlyAmount = await PATCH(
      buildRequest({
        bonusDefaults: [
          { source: "daily_post_free", amount: 20, scheduled_amount: 10 },
        ],
        streakDefaults: streakRows(),
      })
    );
    expect(onlyAmount.status).toBe(400);

    const onlyAt = await PATCH(
      buildRequest({
        bonusDefaults: [
          { source: "daily_post_free", amount: 20, scheduled_at: FUTURE },
        ],
        streakDefaults: streakRows(),
      })
    );
    expect(onlyAt.status).toBe(400);
  });

  test("null を送ると予約を解除できる", async () => {
    const calls = mockSupabase();

    await PATCH(
      buildRequest({
        bonusDefaults: [
          {
            source: "daily_post_free",
            amount: 20,
            scheduled_amount: null,
            scheduled_at: null,
          },
        ],
        streakDefaults: streakRows(),
      })
    );

    const bonusRows = calls.find((c) => c.table === "percoin_bonus_defaults")
      ?.rows as Array<Record<string, unknown>>;
    expect(bonusRows[0]).toMatchObject({
      scheduled_amount: null,
      scheduled_at: null,
    });
  });

  test("予約を省略した行は予約に触らない（既存の予約を消さない）", async () => {
    /*
      省略を「解除」にすると、source と amount だけを送る従来のスクリプトや
      手元の curl が、設定済みの将来予約を黙って消してしまう。
      解除したいときは null を明示する。
    */
    const calls = mockSupabase();

    await PATCH(
      buildRequest({
        bonusDefaults: [{ source: "daily_post_free", amount: 20 }],
        streakDefaults: streakRows(),
      })
    );

    const bonusRows = calls.find((c) => c.table === "percoin_bonus_defaults")
      ?.rows as Array<Record<string, unknown>>;
    expect(bonusRows[0]).not.toHaveProperty("scheduled_at");
    expect(bonusRows[0]).not.toHaveProperty("scheduled_amount");
  });

  test("タイムゾーンの無い日時は 400", async () => {
    /*
      "2026-10-01T00:00" は実行環境のローカル時刻として解釈される。
      JST のつもりで送ると Vercel(UTC)では9時間ずれた時刻で切り替わる。
    */
    mockSupabase();

    const response = await PATCH(
      buildRequest({
        bonusDefaults: [
          {
            source: "daily_post_free",
            amount: 20,
            scheduled_amount: 10,
            scheduled_at: "2099-10-01T00:00",
          },
        ],
        streakDefaults: streakRows(),
      })
    );

    expect(response.status).toBe(400);
  });

  test("+09:00 付きなら通る", async () => {
    mockSupabase();

    const response = await PATCH(
      buildRequest({
        bonusDefaults: [
          {
            source: "daily_post_free",
            amount: 20,
            scheduled_amount: 10,
            scheduled_at: "2099-10-01T00:00:00+09:00",
          },
        ],
        streakDefaults: streakRows(),
      })
    );

    expect(response.status).toBe(200);
  });

  test("連続ログインの予約額も範囲外なら 400", async () => {
    mockSupabase();

    const response = await PATCH(
      buildRequest({
        bonusDefaults: [],
        streakDefaults: streakRows({
          7: { amount: 50, scheduled_amount: 0, scheduled_at: FUTURE },
        }),
      })
    );

    expect(response.status).toBe(400);
  });
});
