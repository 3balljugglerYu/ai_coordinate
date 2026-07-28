/** @jest-environment node */

/**
 * 投稿者向け経路で通報者が特定されないことの回帰テスト。
 *
 * 設計判断: docs/planning/post-moderation-notification-implementation-plan.md
 *           ADR-011 / REQ-022, REQ-023
 *
 * moderation_audit_logs は action='pending_auto' の行に「通報したユーザー本人」の
 * user_id を actor_id として持ち、metadata に通報件数と加重スコアを持つ。
 * 投稿者向けの取得でこれらを射影すると通報者が特定されうるため、
 * 列 allowlist と reject 行限定を固定する。
 */

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

import {
  AUTHOR_FACING_DECISION_COLUMNS,
  getModerationDecisionForOwner,
} from "@/features/moderation/lib/appeal-repository";

const DECISION_ID = "11111111-1111-4111-8111-111111111111";
const POST_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_USER_ID = "44444444-4444-4444-8444-444444444444";
const REPORTER_ID = "55555555-5555-4555-8555-555555555555";

/** 呼び出しを記録しつつ、テーブルごとに用意した結果を返すビルダ。 */
function createAdminMock(resultsByTable: Record<string, unknown>) {
  const selectCalls: Record<string, string[]> = {};
  const filters: Record<string, Array<[string, unknown]>> = {};

  const from = jest.fn((table: string) => {
    const builder: Record<string, unknown> = {
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(resultsByTable[table] ?? { data: null, error: null }).then(
          onFulfilled
        ),
      maybeSingle: () =>
        Promise.resolve(resultsByTable[table] ?? { data: null, error: null }),
      single: () =>
        Promise.resolve(resultsByTable[table] ?? { data: null, error: null }),
      select: jest.fn((cols: string) => {
        selectCalls[table] = [...(selectCalls[table] ?? []), cols];
        return builder;
      }),
      eq: jest.fn((col: string, val: unknown) => {
        filters[table] = [...(filters[table] ?? []), [col, val]];
        return builder;
      }),
    };
    for (const m of ["order", "limit", "in", "gt", "gte", "not", "is", "range"]) {
      builder[m] = jest.fn(() => builder);
    }
    return builder;
  });

  return { client: { from }, selectCalls, filters };
}

describe("投稿者向け判定取得の匿名性 (ADR-011)", () => {
  it("列 allowlist に通報者を特定しうる列を含めない", () => {
    const cols = AUTHOR_FACING_DECISION_COLUMNS.split(",");

    // pending_auto では通報者本人の ID
    expect(cols).not.toContain("actor_id");
    // weightedScore / recentCount / activeUsers が入る
    expect(cols).not.toContain("metadata");
    // 運営内部メモ
    expect(cols).not.toContain("internal_note");

    // 投稿者への説明に必要な列は含まれていること
    expect(cols).toContain("policy_code");
    expect(cols).toContain("author_facing_reason");
    expect(cols).toContain("restriction_scope");
  });

  it("select には allowlist をそのまま渡し、action='reject' に限定する", async () => {
    const { client, selectCalls, filters } = createAdminMock({
      moderation_audit_logs: {
        data: {
          id: DECISION_ID,
          post_id: POST_ID,
          action: "reject",
          policy_code: "rights.copyright",
          author_facing_reason: "著作権侵害のため",
          created_at: "2026-07-28T00:00:00.000Z",
        },
        error: null,
      },
      generated_images: {
        data: { user_id: OWNER_ID, moderation_status: "removed" },
        error: null,
      },
      moderation_notification_outbox: { data: { delivered_at: null }, error: null },
      post_moderation_appeals: { data: null, error: null },
    });

    const result = await getModerationDecisionForOwner(DECISION_ID, OWNER_ID, {
      adminClient: client as never,
    });

    expect(result).not.toBeNull();
    // select("*") ではなく allowlist が渡っていること
    expect(selectCalls.moderation_audit_logs?.[0]).toBe(AUTHOR_FACING_DECISION_COLUMNS);
    expect(selectCalls.moderation_audit_logs?.[0]).not.toBe("*");
    // pending_auto 行を拾わないための action フィルタ
    expect(filters.moderation_audit_logs).toEqual(
      expect.arrayContaining([["action", "reject"]])
    );
  });

  it("返り値に actor_id / metadata / internal_note が現れない", async () => {
    const { client } = createAdminMock({
      // DB が余分な列を返してきても、戻り値に混ぜないことを確認する
      moderation_audit_logs: {
        data: {
          id: DECISION_ID,
          post_id: POST_ID,
          action: "reject",
          policy_code: "rights.copyright",
          author_facing_reason: "著作権侵害のため",
          created_at: "2026-07-28T00:00:00.000Z",
          actor_id: REPORTER_ID,
          internal_note: "通報者3名、うち1名は常連",
          metadata: { weightedScore: 3, recentCount: 3 },
        },
        error: null,
      },
      generated_images: {
        data: { user_id: OWNER_ID, moderation_status: "removed" },
        error: null,
      },
      moderation_notification_outbox: { data: { delivered_at: null }, error: null },
      post_moderation_appeals: { data: null, error: null },
    });

    const result = await getModerationDecisionForOwner(DECISION_ID, OWNER_ID, {
      adminClient: client as never,
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(REPORTER_ID);
    expect(serialized).not.toContain("通報者3名");
    expect(serialized).not.toContain("weightedScore");
    expect(serialized).not.toContain("recentCount");
  });

  it("他人の判定は null を返す（存在しない扱い）", async () => {
    const { client } = createAdminMock({
      moderation_audit_logs: {
        data: {
          id: DECISION_ID,
          post_id: POST_ID,
          action: "reject",
          created_at: "2026-07-28T00:00:00.000Z",
        },
        error: null,
      },
      generated_images: {
        data: { user_id: OWNER_ID, moderation_status: "removed" },
        error: null,
      },
    });

    const result = await getModerationDecisionForOwner(DECISION_ID, OTHER_USER_ID, {
      adminClient: client as never,
    });

    expect(result).toBeNull();
  });

  it("通知が未配送のうちは期限を設けず、申立て可能とする", async () => {
    const { client } = createAdminMock({
      moderation_audit_logs: {
        data: {
          id: DECISION_ID,
          post_id: POST_ID,
          action: "reject",
          created_at: "2026-07-28T00:00:00.000Z",
        },
        error: null,
      },
      generated_images: {
        data: { user_id: OWNER_ID, moderation_status: "removed" },
        error: null,
      },
      moderation_notification_outbox: { data: { delivered_at: null }, error: null },
      post_moderation_appeals: { data: null, error: null },
    });

    const result = await getModerationDecisionForOwner(DECISION_ID, OWNER_ID, {
      adminClient: client as never,
    });

    expect(result?.notifiedAt).toBeNull();
    expect(result?.appealDeadlineAt).toBeNull();
    expect(result?.canAppeal).toBe(true);
  });

  it("配送済みなら配送完了から14日を期限にする", async () => {
    const deliveredAt = "2026-07-01T00:00:00.000Z";
    const { client } = createAdminMock({
      moderation_audit_logs: {
        data: {
          id: DECISION_ID,
          post_id: POST_ID,
          action: "reject",
          created_at: "2026-07-01T00:00:00.000Z",
        },
        error: null,
      },
      generated_images: {
        data: { user_id: OWNER_ID, moderation_status: "removed" },
        error: null,
      },
      moderation_notification_outbox: { data: { delivered_at: deliveredAt }, error: null },
      post_moderation_appeals: { data: null, error: null },
    });

    const result = await getModerationDecisionForOwner(DECISION_ID, OWNER_ID, {
      adminClient: client as never,
    });

    expect(result?.appealDeadlineAt).toBe("2026-07-15T00:00:00.000Z");
  });
});
