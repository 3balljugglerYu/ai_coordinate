/** @jest-environment node */

/**
 * モデレーション通知 outbox の健全性判定のテスト。
 *
 * このカードの目的は「dispatcher が止まっていることに運営が気づけること」。
 * 判定が甘いと詰まりを見逃し、投稿者は公開停止を知らされないまま放置される。
 * 逆に厳しすぎると一時的な再試行で毎回赤くなり、警告が無視されるようになる。
 * 閾値の意味をここで固定する。
 */

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

import {
  getModerationOutboxHealth,
  getOutboxSeverity,
  type ModerationOutboxHealth,
} from "@/features/admin-dashboard/lib/get-moderation-outbox-health";

const NOW = new Date("2026-07-29T12:00:00.000Z").getTime();

function health(overrides: Partial<ModerationOutboxHealth>): ModerationOutboxHealth {
  return {
    pendingCount: 0,
    oldestPendingAt: null,
    maxAttemptCount: 0,
    lastError: null,
    deliveredCount: 0,
    unavailable: false,
    ...overrides,
  };
}

function minutesAgo(minutes: number): string {
  return new Date(NOW - minutes * 60_000).toISOString();
}

describe("getOutboxSeverity", () => {
  it("未配送が無ければ ok", () => {
    expect(getOutboxSeverity(health({ deliveredCount: 10 }), NOW)).toBe("ok");
  });

  it("未配送があっても新しければ watch（再試行中の可能性が高い）", () => {
    const result = getOutboxSeverity(
      health({ pendingCount: 1, oldestPendingAt: minutesAgo(2), maxAttemptCount: 1 }),
      NOW
    );
    expect(result).toBe("watch");
  });

  it("30分以上滞留していれば stuck", () => {
    const result = getOutboxSeverity(
      health({ pendingCount: 1, oldestPendingAt: minutesAgo(31), maxAttemptCount: 1 }),
      NOW
    );
    expect(result).toBe("stuck");
  });

  it("30分ちょうどでも stuck（境界を見逃さない）", () => {
    const result = getOutboxSeverity(
      health({ pendingCount: 1, oldestPendingAt: minutesAgo(30), maxAttemptCount: 1 }),
      NOW
    );
    expect(result).toBe("stuck");
  });

  it("試行が3回を超えていれば、新しくても stuck（恒久的な失敗）", () => {
    const result = getOutboxSeverity(
      health({ pendingCount: 1, oldestPendingAt: minutesAgo(1), maxAttemptCount: 4 }),
      NOW
    );
    expect(result).toBe("stuck");
  });

  it("試行3回までは watch（指数バックオフの範囲内）", () => {
    const result = getOutboxSeverity(
      health({ pendingCount: 1, oldestPendingAt: minutesAgo(1), maxAttemptCount: 3 }),
      NOW
    );
    expect(result).toBe("watch");
  });

  it("oldestPendingAt が壊れていても落ちず watch に倒す", () => {
    const result = getOutboxSeverity(
      health({ pendingCount: 1, oldestPendingAt: "not-a-date", maxAttemptCount: 0 }),
      NOW
    );
    expect(result).toBe("watch");
  });
});

describe("getModerationOutboxHealth", () => {
  /** pending 取得と delivered カウントの2クエリを順に返すモック。 */
  function mockClient(
    pending: { data: unknown; error: unknown },
    delivered: { count: number }
  ) {
    let call = 0;
    const from = jest.fn(() => {
      const isFirst = call++ === 0;
      const result = isFirst ? pending : { ...delivered, error: null };
      const builder: Record<string, unknown> = {
        then: (f: (v: unknown) => unknown) => Promise.resolve(result).then(f),
      };
      for (const m of ["select", "eq", "order"]) {
        builder[m] = jest.fn(() => builder);
      }
      return builder;
    });
    return { from };
  }

  it("未配送が無ければ 0 件と配送済み件数を返す", async () => {
    const client = mockClient({ data: [], error: null }, { count: 42 });
    const result = await getModerationOutboxHealth(client as never);

    expect(result.pendingCount).toBe(0);
    expect(result.deliveredCount).toBe(42);
    expect(result.unavailable).toBe(false);
  });

  it("最古の滞留・最大試行回数・直近のエラーを集計する", async () => {
    const client = mockClient(
      {
        data: [
          // created_at 昇順で取得している前提
          { created_at: minutesAgo(60), attempt_count: 2, last_error: "older" },
          { created_at: minutesAgo(10), attempt_count: 5, last_error: "newest" },
        ],
        error: null,
      },
      { count: 3 }
    );

    const result = await getModerationOutboxHealth(client as never);

    expect(result.pendingCount).toBe(2);
    expect(result.oldestPendingAt).toBe(minutesAgo(60));
    expect(result.maxAttemptCount).toBe(5);
    // 試行回数が最も多い行のエラーを直近の失敗として拾う
    expect(result.lastError).toBe("newest");
  });

  it("取得に失敗したら unavailable を立てて呼び出し側を落とさない", async () => {
    const client = mockClient(
      { data: null, error: { message: "boom" } },
      { count: 0 }
    );
    const result = await getModerationOutboxHealth(client as never);

    expect(result.unavailable).toBe(true);
    expect(result.pendingCount).toBe(0);
  });
});
