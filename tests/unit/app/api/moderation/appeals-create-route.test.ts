/** @jest-environment node */

/**
 * POST /api/moderation/appeals の権限・前提検証の回帰テスト。
 *
 * 設計判断: docs/planning/post-moderation-notification-implementation-plan.md
 *           ADR-004 / REQ-007, REQ-008, REQ-009, REQ-014
 *
 * appellant_id はサーバー側セッションから解決し、リクエストボディからは
 * 受け取らない（なりすまし防止）。他人の判定は 404 として扱う。
 */

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

jest.mock("@/lib/security/same-origin", () => ({
  ensureSameOrigin: jest.fn(() => null),
}));

jest.mock("@/lib/api/route-locale", () => ({
  getRouteLocale: jest.fn(() => "ja"),
}));

jest.mock("@/features/moderation/lib/appeal-repository", () => ({
  resolveAppealPreconditions: jest.fn(),
  createAppealAsOwner: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/moderation/appeals/route";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createAppealAsOwner,
  resolveAppealPreconditions,
} from "@/features/moderation/lib/appeal-repository";

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;
const mockResolve = resolveAppealPreconditions as jest.MockedFunction<
  typeof resolveAppealPreconditions
>;
const mockCreate = createAppealAsOwner as jest.MockedFunction<typeof createAppealAsOwner>;

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "99999999-9999-4999-8999-999999999999";
const DECISION_ID = "22222222-2222-4222-8222-222222222222";
const POST_ID = "33333333-3333-4333-8333-333333333333";
const APPEAL_ID = "44444444-4444-4444-8444-444444444444";

function mockSession(user: { id: string } | null) {
  mockCreateClient.mockResolvedValue({
    auth: { getUser: jest.fn(async () => ({ data: { user }, error: null })) },
  } as never);
}

function request(body: unknown) {
  return new NextRequest("https://example.com/api/moderation/appeals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/moderation/appeals", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateAdminClient.mockReturnValue({} as never);
  });

  it("未認証は 401", async () => {
    mockSession(null);
    const response = await POST(
      request({ moderationDecisionId: DECISION_ID, body: "本文" })
    );
    expect(response.status).toBe(401);
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it("本文が空なら 400", async () => {
    mockSession({ id: USER_ID });
    const response = await POST(
      request({ moderationDecisionId: DECISION_ID, body: "   " })
    );
    expect(response.status).toBe(400);
  });

  it("判定 ID が UUID でなければ 400", async () => {
    mockSession({ id: USER_ID });
    const response = await POST(
      request({ moderationDecisionId: "not-a-uuid", body: "本文" })
    );
    expect(response.status).toBe(400);
  });

  it("appellant_id はセッション由来で、ボディの値は無視される", async () => {
    mockSession({ id: USER_ID });
    mockResolve.mockResolvedValue({ ok: true, postId: POST_ID, deadline: null });
    mockCreate.mockResolvedValue({ ok: true, appealId: APPEAL_ID });

    const response = await POST(
      request({
        moderationDecisionId: DECISION_ID,
        body: "本文",
        // なりすましを狙って渡してみる
        appellantId: OTHER_USER_ID,
      })
    );

    expect(response.status).toBe(200);
    // 事前チェックはセッションの user id で行う
    expect(mockResolve).toHaveBeenCalledWith(DECISION_ID, USER_ID, expect.anything());
    // 作成は RPC 経由。appellant_id はクライアントから渡さず、DB 側で
    // auth.uid() から決定される（レビュー指摘 [P1] 対応）
    const createArgs = mockCreate.mock.calls[0]?.[0];
    expect(createArgs).toEqual(
      expect.objectContaining({ decisionId: DECISION_ID, body: "本文" })
    );
    // ボディで渡した他人の ID がどこにも混入しないこと
    expect(JSON.stringify(createArgs ?? {})).not.toContain(OTHER_USER_ID);
  });

  it("他人の判定は 404（存在しない扱い）", async () => {
    mockSession({ id: USER_ID });
    mockResolve.mockResolvedValue({ ok: false, reason: "not_found" });

    const response = await POST(
      request({ moderationDecisionId: DECISION_ID, body: "本文" })
    );
    expect(response.status).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("重複申立ては 409", async () => {
    mockSession({ id: USER_ID });
    mockResolve.mockResolvedValue({ ok: false, reason: "already_exists" });

    const response = await POST(
      request({ moderationDecisionId: DECISION_ID, body: "本文" })
    );
    expect(response.status).toBe(409);
  });

  it("期限切れは 409", async () => {
    mockSession({ id: USER_ID });
    mockResolve.mockResolvedValue({ ok: false, reason: "expired" });

    const response = await POST(
      request({ moderationDecisionId: DECISION_ID, body: "本文" })
    );
    const payload = await response.json();
    expect(response.status).toBe(409);
    expect(payload.errorCode).toBe("APPEAL_DEADLINE_PASSED");
  });

  it("公開中の投稿への申立ては 409", async () => {
    mockSession({ id: USER_ID });
    mockResolve.mockResolvedValue({ ok: false, reason: "not_removed" });

    const response = await POST(
      request({ moderationDecisionId: DECISION_ID, body: "本文" })
    );
    const payload = await response.json();
    expect(response.status).toBe(409);
    expect(payload.errorCode).toBe("APPEAL_NOT_APPLICABLE");
  });

  it("RPC 側で重複を検出した場合も 409 に落とす（競合時の保険）", async () => {
    mockSession({ id: USER_ID });
    mockResolve.mockResolvedValue({ ok: true, postId: POST_ID, deadline: null });
    mockCreate.mockResolvedValue({ ok: false, reason: "duplicate" });

    const response = await POST(
      request({ moderationDecisionId: DECISION_ID, body: "本文" })
    );
    expect(response.status).toBe(409);
  });

  it("RPC がその他の理由で失敗したら 500", async () => {
    mockSession({ id: USER_ID });
    mockResolve.mockResolvedValue({ ok: true, postId: POST_ID, deadline: null });
    mockCreate.mockResolvedValue({ ok: false, reason: "unknown" });

    const response = await POST(
      request({ moderationDecisionId: DECISION_ID, body: "本文" })
    );
    expect(response.status).toBe(500);
  });

  it("成功時は appealId と期限を返す", async () => {
    const deadline = "2026-08-11T00:00:00.000Z";
    mockSession({ id: USER_ID });
    mockResolve.mockResolvedValue({ ok: true, postId: POST_ID, deadline });
    mockCreate.mockResolvedValue({ ok: true, appealId: APPEAL_ID });

    const response = await POST(
      request({ moderationDecisionId: DECISION_ID, body: "本文" })
    );
    const payload = await response.json();

    expect(payload).toEqual({
      appealId: APPEAL_ID,
      status: "pending",
      appealDeadlineAt: deadline,
    });
  });
});
