/** @jest-environment node */

/**
 * appeal-repository の所有者チェック・期限・重複判定の検証。
 *
 * 設計判断: docs/planning/post-moderation-notification-implementation-plan.md
 *           ADR-004, ADR-008 / REQ-007〜009, REQ-012, REQ-013
 *
 * 匿名性そのものは appeal-repository-anonymity.test.ts で扱う。
 * ここでは「他人の投稿を掴めないこと」「期限の起算が配送完了であること」
 * 「重複申立てを弾くこと」を固定する。
 */

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

import {
  APPEAL_WINDOW_DAYS,
  createAppealAsOwner,
  getCurrentRemovalDecisionId,
  listPendingAppealsForAdmin,
  resolveAppealPreconditions,
} from "@/features/moderation/lib/appeal-repository";

const POST_ID = "11111111-1111-4111-8111-111111111111";
const DECISION_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_ID = "44444444-4444-4444-8444-444444444444";
const APPEAL_ID = "55555555-5555-4555-8555-555555555555";
const ADMIN_ID = "66666666-6666-4666-8666-666666666666";

/** テーブルごとに結果を返すチェーンモック。 */
function createChain(resultsByTable: Record<string, unknown>) {
  const from = jest.fn((table: string) => {
    const result = resultsByTable[table] ?? { data: null, error: null };
    const builder: Record<string, unknown> = {
      maybeSingle: () => Promise.resolve(result),
      single: () => Promise.resolve(result),
      then: (f: (v: unknown) => unknown) => Promise.resolve(result).then(f),
    };
    for (const m of [
      "select",
      "insert",
      "eq",
      "order",
      "limit",
      "in",
      "range",
      "gt",
      "gte",
      "not",
      "is",
    ]) {
      builder[m] = jest.fn(() => builder);
    }
    return builder;
  });
  return { from };
}

describe("getCurrentRemovalDecisionId", () => {
  it("公開停止中の自分の投稿なら最新の reject 判定 ID を返す", async () => {
    const client = createChain({
      generated_images: {
        data: { user_id: OWNER_ID, moderation_status: "removed" },
        error: null,
      },
      moderation_audit_logs: { data: { id: DECISION_ID }, error: null },
    });

    const result = await getCurrentRemovalDecisionId(
      POST_ID,
      OWNER_ID,
      client as never
    );
    expect(result).toBe(DECISION_ID);
  });

  it("他人の投稿なら null", async () => {
    const client = createChain({
      generated_images: {
        data: { user_id: OWNER_ID, moderation_status: "removed" },
        error: null,
      },
    });

    const result = await getCurrentRemovalDecisionId(
      POST_ID,
      OTHER_ID,
      client as never
    );
    expect(result).toBeNull();
  });

  it("既に公開に戻っている投稿なら null", async () => {
    const client = createChain({
      generated_images: {
        data: { user_id: OWNER_ID, moderation_status: "visible" },
        error: null,
      },
    });

    const result = await getCurrentRemovalDecisionId(
      POST_ID,
      OWNER_ID,
      client as never
    );
    expect(result).toBeNull();
  });

  it("投稿が存在しなければ null", async () => {
    const client = createChain({ generated_images: { data: null, error: null } });
    const result = await getCurrentRemovalDecisionId(
      POST_ID,
      OWNER_ID,
      client as never
    );
    expect(result).toBeNull();
  });
});

describe("resolveAppealPreconditions", () => {
  const baseTables = (overrides: Record<string, unknown> = {}) => ({
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
    moderation_notification_outbox: { data: { delivered_at: null }, error: null },
    post_moderation_appeals: { data: null, error: null },
    ...overrides,
  });

  it("未配送でも申立て可能とし、期限は null で返す", async () => {
    const client = createChain(baseTables());
    const result = await resolveAppealPreconditions(
      DECISION_ID,
      OWNER_ID,
      client as never
    );

    expect(result).toEqual({ ok: true, postId: POST_ID, deadline: null });
  });

  it("配送完了から14日以内なら申立て可能", async () => {
    const deliveredAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const client = createChain(
      baseTables({
        moderation_notification_outbox: {
          data: { delivered_at: deliveredAt },
          error: null,
        },
      })
    );

    const result = await resolveAppealPreconditions(
      DECISION_ID,
      OWNER_ID,
      client as never
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.deadline).not.toBeNull();
    }
  });

  it("配送完了から14日を過ぎていれば expired", async () => {
    const deliveredAt = new Date(
      Date.now() - (APPEAL_WINDOW_DAYS + 1) * 24 * 60 * 60 * 1000
    ).toISOString();
    const client = createChain(
      baseTables({
        moderation_notification_outbox: {
          data: { delivered_at: deliveredAt },
          error: null,
        },
      })
    );

    const result = await resolveAppealPreconditions(
      DECISION_ID,
      OWNER_ID,
      client as never
    );

    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("既に申立て済みなら already_exists", async () => {
    const client = createChain(
      baseTables({
        post_moderation_appeals: {
          data: {
            id: APPEAL_ID,
            post_id: POST_ID,
            removal_decision_id: DECISION_ID,
            status: "pending",
            body: "本文",
            decision_note: null,
            decided_at: null,
            appeal_deadline_at: null,
            created_at: "2026-07-02T00:00:00.000Z",
          },
          error: null,
        },
      })
    );

    const result = await resolveAppealPreconditions(
      DECISION_ID,
      OWNER_ID,
      client as never
    );

    expect(result).toEqual({ ok: false, reason: "already_exists" });
  });

  it("既に公開に戻っていれば not_removed", async () => {
    const client = createChain(
      baseTables({
        generated_images: {
          data: { user_id: OWNER_ID, moderation_status: "visible" },
          error: null,
        },
      })
    );

    const result = await resolveAppealPreconditions(
      DECISION_ID,
      OWNER_ID,
      client as never
    );

    expect(result).toEqual({ ok: false, reason: "not_removed" });
  });

  it("他人の判定なら not_found（存在しない扱い）", async () => {
    const client = createChain(baseTables());
    const result = await resolveAppealPreconditions(
      DECISION_ID,
      OTHER_ID,
      client as never
    );

    expect(result).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("listPendingAppealsForAdmin", () => {
  it("元判定者・内部メモ・サムネイル情報を突き合わせて返す", async () => {
    const appealRow = {
      id: APPEAL_ID,
      post_id: POST_ID,
      removal_decision_id: DECISION_ID,
      appellant_id: OWNER_ID,
      status: "pending",
      body: "誤判定です",
      decision_note: null,
      decided_at: null,
      appeal_deadline_at: null,
      created_at: "2026-07-02T00:00:00.000Z",
    };

    const client = createChain({
      post_moderation_appeals: { data: [appealRow], error: null },
      moderation_audit_logs: {
        data: [
          {
            id: DECISION_ID,
            actor_id: ADMIN_ID,
            policy_code: "rights.copyright",
            author_facing_reason: "著作権侵害のため",
            internal_note: "通報者3名",
          },
        ],
        error: null,
      },
      generated_images: {
        data: [
          { id: POST_ID, image_url: "https://example.com/a.png", storage_path_thumb: null },
        ],
        error: null,
      },
    });

    const result = await listPendingAppealsForAdmin(50, 0, client as never);

    expect(result).toHaveLength(1);
    expect(result[0].original_actor_id).toBe(ADMIN_ID);
    expect(result[0].internal_note).toBe("通報者3名");
    expect(result[0].post_image_url).toBe("https://example.com/a.png");
  });

  it("該当なしなら空配列", async () => {
    const client = createChain({
      post_moderation_appeals: { data: [], error: null },
    });
    const result = await listPendingAppealsForAdmin(50, 0, client as never);
    expect(result).toEqual([]);
  });

  it("取得エラー時は空配列を返して呼び出し側を落とさない", async () => {
    const client = createChain({
      post_moderation_appeals: { data: null, error: { message: "boom" } },
    });
    const result = await listPendingAppealsForAdmin(50, 0, client as never);
    expect(result).toEqual([]);
  });
});

describe("createAppealAsOwner", () => {
  /**
   * レビュー指摘 [P1] 対応で、直接 INSERT から SECURITY DEFINER RPC 経由に変更した。
   * RLS の WITH CHECK だけでは status='overturned' や任意の appeal_deadline_at を
   * PostgREST から書き込めてしまうため。
   */
  function rpcClient(result: { data: unknown; error: unknown }) {
    return { rpc: jest.fn(async () => result) };
  }

  it("RPC 経由で作成し appealId を返す", async () => {
    const client = rpcClient({ data: APPEAL_ID, error: null });

    const result = await createAppealAsOwner({
      decisionId: DECISION_ID,
      body: "誤判定です",
      sessionClientOverride: client as never,
    });

    expect(result).toEqual({ ok: true, appealId: APPEAL_ID });
    // 直接 INSERT ではなく RPC を呼ぶこと。post_id / appellant_id / status /
    // appeal_deadline_at はクライアントから渡さない（DB 側で決定する）
    expect(client.rpc).toHaveBeenCalledWith("create_post_moderation_appeal", {
      p_decision_id: DECISION_ID,
      p_body: "誤判定です",
    });
  });

  it("unique 違反は duplicate として分類する", async () => {
    const client = rpcClient({
      data: null,
      error: { code: "23505", message: "duplicate key value" },
    });

    const result = await createAppealAsOwner({
      decisionId: DECISION_ID,
      body: "本文",
      sessionClientOverride: client as never,
    });

    expect(result).toEqual({ ok: false, reason: "duplicate" });
  });

  it("RPC の各例外を対応する理由に分類する", async () => {
    const cases: Array<[string, string]> = [
      ["appeal_decision_not_found", "not_found"],
      ["appeal_post_not_removed", "not_removed"],
      ["appeal_deadline_passed", "expired"],
      ["appeal_target_not_current_removal", "not_current_removal"],
      ["appeal_body_invalid_length", "invalid_body"],
    ];

    for (const [message, expected] of cases) {
      const client = rpcClient({ data: null, error: { message } });
      const result = await createAppealAsOwner({
        decisionId: DECISION_ID,
        body: "本文",
        sessionClientOverride: client as never,
      });
      expect(result).toEqual({ ok: false, reason: expected });
    }
  });

  it("未知のエラーは unknown として返す", async () => {
    const client = rpcClient({ data: null, error: { message: "boom" } });

    const result = await createAppealAsOwner({
      decisionId: DECISION_ID,
      body: "本文",
      sessionClientOverride: client as never,
    });

    expect(result).toEqual({ ok: false, reason: "unknown" });
  });

  it("RPC が値を返さなければ unknown", async () => {
    const client = rpcClient({ data: null, error: null });

    const result = await createAppealAsOwner({
      decisionId: DECISION_ID,
      body: "本文",
      sessionClientOverride: client as never,
    });

    expect(result).toEqual({ ok: false, reason: "unknown" });
  });
});
