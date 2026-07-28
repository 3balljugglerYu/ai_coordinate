/** @jest-environment node */

/**
 * 異議申立て API の権限・匿名性・用語マッピングの回帰テスト。
 *
 * 設計判断: docs/planning/post-moderation-notification-implementation-plan.md
 *           ADR-005, ADR-009, ADR-011 / REQ-010, REQ-011, REQ-012
 *
 * uphold = 棄却（removed のまま）/ overturn = 認容（visible へ復帰）の対応を
 * 取り違えると、投稿者の救済が逆転するのでここで固定する。
 */

jest.mock("next/cache", () => ({
  revalidateTag: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({
  requireAdmin: jest.fn(),
}));

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

jest.mock("@/lib/admin-audit", () => ({
  logAdminAction: jest.fn(),
}));

jest.mock("@/lib/security/same-origin", () => ({
  ensureSameOrigin: jest.fn(() => null),
}));

jest.mock("@/features/moderation/lib/appeal-repository", () => ({
  listPendingAppealsForAdmin: jest.fn(),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/admin/moderation/appeals/route";
import { POST } from "@/app/api/admin/moderation/appeals/[appealId]/decision/route";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { listPendingAppealsForAdmin } from "@/features/moderation/lib/appeal-repository";
import { revalidateTag } from "next/cache";

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>;
const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;
const mockListAppeals = listPendingAppealsForAdmin as jest.MockedFunction<
  typeof listPendingAppealsForAdmin
>;
const mockLogAdminAction = logAdminAction as jest.MockedFunction<typeof logAdminAction>;
const mockRevalidateTag = revalidateTag as jest.MockedFunction<typeof revalidateTag>;

const ADMIN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ADMIN_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const APPEAL_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const POST_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const AUTHOR_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function buildAdminClient(rpcResult: { data: unknown; error: unknown }) {
  const rpc = jest.fn(async (name: string) => {
    if (name === "decide_post_moderation_appeal") return rpcResult;
    return { data: 1, error: null };
  });

  const from = jest.fn((table: string) => {
    const result =
      table === "post_moderation_appeals"
        ? { data: { id: APPEAL_ID, post_id: POST_ID, status: "pending" }, error: null }
        : { data: { user_id: AUTHOR_ID }, error: null };
    const builder: Record<string, unknown> = {
      maybeSingle: () => Promise.resolve(result),
      then: (f: (v: unknown) => unknown) => Promise.resolve(result).then(f),
    };
    for (const m of ["select", "eq", "order", "limit", "in", "range"]) {
      builder[m] = jest.fn(() => builder);
    }
    return builder;
  });

  return { rpc, from };
}

function decisionRequest(body: unknown) {
  return new NextRequest(
    `https://example.com/api/admin/moderation/appeals/${APPEAL_ID}/decision`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("GET /api/admin/moderation/appeals", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ id: ADMIN_ID } as never);
    mockCreateAdminClient.mockReturnValue({} as never);
  });

  it("他の運営の user id をレスポンスに含めず、自分が元判定者かの真偽値だけを返す", async () => {
    mockListAppeals.mockResolvedValue([
      {
        id: APPEAL_ID,
        post_id: POST_ID,
        removal_decision_id: "f1111111-1111-4111-8111-111111111111",
        appellant_id: AUTHOR_ID,
        status: "pending",
        body: "誤判定だと思います",
        decision_note: null,
        decided_at: null,
        appeal_deadline_at: null,
        created_at: "2026-07-28T00:00:00.000Z",
        original_actor_id: OTHER_ADMIN_ID,
        policy_code: "rights.copyright",
        author_facing_reason: "著作権侵害のため",
        internal_note: "通報者3名",
        post_image_url: "https://example.com/a.webp",
        post_storage_path_thumb: null,
        hide_thumbnail: false,
      },
    ] as never);

    const response = await GET(
      new NextRequest("https://example.com/api/admin/moderation/appeals")
    );
    const payload = await response.json();
    const serialized = JSON.stringify(payload);

    expect(response.status).toBe(200);
    // 他の運営の ID は露出させない
    expect(serialized).not.toContain(OTHER_ADMIN_ID);
    expect(payload.appeals[0].is_original_decider).toBe(false);
    // 運営向けなので内部メモは含めてよい
    expect(payload.appeals[0].internal_note).toBe("通報者3名");
  });

  it("元判定者が自分なら is_original_decider が true になる", async () => {
    mockListAppeals.mockResolvedValue([
      {
        id: APPEAL_ID,
        post_id: POST_ID,
        removal_decision_id: "f1111111-1111-4111-8111-111111111111",
        appellant_id: AUTHOR_ID,
        status: "pending",
        body: "本文",
        decision_note: null,
        decided_at: null,
        appeal_deadline_at: null,
        created_at: "2026-07-28T00:00:00.000Z",
        original_actor_id: ADMIN_ID,
        policy_code: "sexual.minor_sexual",
        author_facing_reason: "理由",
        internal_note: null,
        post_image_url: "https://example.com/a.webp",
        post_storage_path_thumb: null,
        hide_thumbnail: false,
      },
    ] as never);

    const response = await GET(
      new NextRequest("https://example.com/api/admin/moderation/appeals")
    );
    const payload = await response.json();

    expect(payload.appeals[0].is_original_decider).toBe(true);
    // 重大カテゴリはサムネイルを返さない
    expect(payload.appeals[0].post_image_url).toBeNull();
    expect(payload.appeals[0].hide_thumbnail).toBe(true);
  });
});

describe("POST /api/admin/moderation/appeals/[appealId]/decision", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ id: ADMIN_ID } as never);
    mockLogAdminAction.mockResolvedValue(undefined as never);
  });

  it("overturn は認容として RPC に渡り、キャッシュを無効化する", async () => {
    const client = buildAdminClient({ data: true, error: null });
    mockCreateAdminClient.mockReturnValue(client as never);

    const response = await POST(
      decisionRequest({ action: "overturn", note: "再確認しました" }),
      { params: Promise.resolve({ appealId: APPEAL_ID }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("overturned");
    expect(client.rpc).toHaveBeenCalledWith(
      "decide_post_moderation_appeal",
      expect.objectContaining({ p_action: "overturn", p_note: "再確認しました" })
    );
    // 復帰するのでフィードのキャッシュを落とす（REQ-011）
    expect(mockRevalidateTag).toHaveBeenCalled();
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "moderation_appeal_overturn" })
    );
  });

  it("uphold は棄却として扱い、キャッシュ無効化を行わない", async () => {
    const client = buildAdminClient({ data: true, error: null });
    mockCreateAdminClient.mockReturnValue(client as never);

    const response = await POST(
      decisionRequest({ action: "uphold", note: "判定を維持します" }),
      { params: Promise.resolve({ appealId: APPEAL_ID }) }
    );
    const payload = await response.json();

    expect(payload.status).toBe("upheld");
    // 投稿は removed のままなのでフィードは変わらない
    expect(mockRevalidateTag).not.toHaveBeenCalled();
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: "moderation_appeal_uphold" })
    );
  });

  it("理由が空なら 400 で拒否する", async () => {
    const client = buildAdminClient({ data: true, error: null });
    mockCreateAdminClient.mockReturnValue(client as never);

    const response = await POST(decisionRequest({ action: "uphold", note: "   " }), {
      params: Promise.resolve({ appealId: APPEAL_ID }),
    });

    expect(response.status).toBe(400);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("独立レビューの例外理由が未入力なら RPC の例外を 400 に変換する", async () => {
    const client = buildAdminClient({
      data: null,
      error: { message: "independence_exception_reason_required" },
    });
    mockCreateAdminClient.mockReturnValue(client as never);

    const response = await POST(
      decisionRequest({ action: "overturn", note: "理由" }),
      { params: Promise.resolve({ appealId: APPEAL_ID }) }
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.errorCode).toBe("APPEAL_INDEPENDENCE_REASON_REQUIRED");
  });

  it("既に判定済みなら 409 を返す（再送の吸収）", async () => {
    const client = buildAdminClient({ data: false, error: null });
    mockCreateAdminClient.mockReturnValue(client as never);

    const response = await POST(
      decisionRequest({ action: "uphold", note: "理由" }),
      { params: Promise.resolve({ appealId: APPEAL_ID }) }
    );

    expect(response.status).toBe(409);
  });
});
