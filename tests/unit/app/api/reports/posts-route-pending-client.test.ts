/** @jest-environment node */

/**
 * POST /api/reports/posts の pending 化経路が service_role クライアントを使うことの回帰テスト。
 *
 * 設計判断: docs/planning/post-moderation-notification-implementation-plan.md ADR-010 / REQ-020
 *
 * `mark_post_pending_by_report` は anon / authenticated から EXECUTE を剥奪し
 * service_role 専用にした。そのためルート側は必ず `createAdminClient()` 由来の
 * クライアントから RPC を呼ぶ必要がある。セッションクライアントに戻ると本番で
 * 権限エラーになり、通報起因の自動非表示が無言で停止するため、ここを固定する。
 */

jest.mock("next/cache", () => ({
  revalidateTag: jest.fn(),
}));

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

jest.mock("@/lib/env", () => ({
  getAdminUserIds: jest.fn(() => []),
}));

jest.mock("@/lib/security/same-origin", () => ({
  ensureSameOrigin: jest.fn(() => null),
}));

jest.mock("@/lib/api/route-locale", () => ({
  getRouteLocale: jest.fn(() => "ja"),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/reports/posts/route";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUserIds } from "@/lib/env";

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;
const mockGetAdminUserIds = getAdminUserIds as jest.MockedFunction<
  typeof getAdminUserIds
>;

const POST_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REPORTER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const AUTHOR_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const REPORT_ROW_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

type QueryResult = Record<string, unknown>;

/**
 * PostgREST のチェーン呼び出しを受け流し、テーブルごとに用意した結果を順に返すビルダ。
 * `await builder` と `builder.maybeSingle()` の両方で解決できるよう thenable にしている。
 */
function createChainMock(resultsByTable: Record<string, QueryResult[]>) {
  const cursors: Record<string, number> = {};

  const nextResult = (table: string): QueryResult => {
    const queue = resultsByTable[table] ?? [];
    const index = cursors[table] ?? 0;
    cursors[table] = index + 1;
    return queue[index] ?? { data: null, error: null, count: 0 };
  };

  const makeBuilder = (table: string) => {
    const resolve = () => Promise.resolve(nextResult(table));
    const builder: Record<string, unknown> = {
      then: (onFulfilled: (value: QueryResult) => unknown) =>
        resolve().then(onFulfilled),
      maybeSingle: () => resolve(),
      single: () => resolve(),
    };
    for (const method of [
      "select",
      "insert",
      "update",
      "delete",
      "eq",
      "gt",
      "gte",
      "lt",
      "lte",
      "not",
      "in",
      "is",
      "or",
      "order",
      "range",
      "limit",
    ]) {
      builder[method] = jest.fn(() => builder);
    }
    return builder;
  };

  return {
    from: jest.fn((table: string) => makeBuilder(table)),
  };
}

function buildSessionClient() {
  const client = createChainMock({
    // 1,2回目: レート制限カウント / 3回目: 通報行の INSERT
    post_reports: [
      { count: 0, error: null },
      { count: 0, error: null },
      { data: { id: REPORT_ROW_ID }, error: null },
    ],
    // 1回目: 対象投稿の取得 / 2回目: 通報者の投稿数カウント
    generated_images: [
      {
        data: {
          id: POST_ID,
          user_id: AUTHOR_ID,
          is_posted: true,
          moderation_status: "visible",
          moderation_approved_at: null,
        },
        error: null,
      },
      { count: 3, error: null },
    ],
  });

  return {
    ...client,
    auth: {
      getUser: jest.fn(async () => ({
        data: { user: { id: REPORTER_ID, created_at: "2020-01-01T00:00:00.000Z" } },
        error: null,
      })),
    },
    // セッションクライアントから RPC を呼んでいないことを検証するために生やす
    rpc: jest.fn(async () => ({ data: true, error: null })),
  };
}

function buildRequest() {
  return new NextRequest("https://example.com/api/reports/posts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      postId: POST_ID,
      categoryId: "rights",
      subcategoryId: "copyright",
    }),
  });
}

describe("POST /api/reports/posts の pending 化クライアント (ADR-010)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("運営通報では admin クライアントから pending RPC を呼び、セッションクライアントは使わない", async () => {
    mockGetAdminUserIds.mockReturnValue([REPORTER_ID]);

    const sessionClient = buildSessionClient();
    mockCreateClient.mockResolvedValue(
      sessionClient as unknown as Awaited<ReturnType<typeof createClient>>
    );

    const adminRpc = jest.fn(async () => ({ data: true, error: null }));
    const adminClient = {
      ...createChainMock({}),
      rpc: adminRpc,
    };
    mockCreateAdminClient.mockReturnValue(
      adminClient as unknown as ReturnType<typeof createAdminClient>
    );

    const response = await POST(buildRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.postModerationStatus).toBe("pending");

    // service_role 側で呼ばれていること
    expect(adminRpc).toHaveBeenCalledTimes(1);
    expect(adminRpc).toHaveBeenCalledWith(
      "mark_post_pending_by_report",
      expect.objectContaining({
        p_post_id: POST_ID,
        p_actor_id: REPORTER_ID,
        p_reason: "admin_immediate",
      })
    );

    // セッションクライアントからは RPC を呼ばないこと (ここが退行すると本番で権限エラーになる)
    expect(sessionClient.rpc).not.toHaveBeenCalled();
  });

  it("一般ユーザーの通報がしきい値に達した場合も admin クライアントから pending RPC を呼ぶ", async () => {
    mockGetAdminUserIds.mockReturnValue([]);

    const sessionClient = buildSessionClient();
    mockCreateClient.mockResolvedValue(
      sessionClient as unknown as Awaited<ReturnType<typeof createClient>>
    );

    const adminRpc = jest.fn(async () => ({ data: true, error: null }));
    const adminClient = {
      ...createChainMock({
        // calculatePendingMetrics: 通報行 (加重合計 3.0 でしきい値到達)
        post_reports: [
          {
            data: [
              { weight: 1, created_at: new Date().toISOString() },
              { weight: 1, created_at: new Date().toISOString() },
              { weight: 1, created_at: new Date().toISOString() },
            ],
            error: null,
          },
        ],
        // アクティブユーザー算出用
        generated_images: [{ data: [{ user_id: AUTHOR_ID }], error: null }],
      }),
      rpc: adminRpc,
    };
    mockCreateAdminClient.mockReturnValue(
      adminClient as unknown as ReturnType<typeof createAdminClient>
    );

    const response = await POST(buildRequest());

    expect(response.status).toBe(200);
    expect(adminRpc).toHaveBeenCalledWith(
      "mark_post_pending_by_report",
      expect.objectContaining({
        p_post_id: POST_ID,
        p_reason: "report_threshold",
      })
    );
    expect(sessionClient.rpc).not.toHaveBeenCalled();
  });

  it("RPC が失敗したときの pending 再確認も admin クライアントで行う", async () => {
    mockGetAdminUserIds.mockReturnValue([REPORTER_ID]);

    const sessionClient = buildSessionClient();
    mockCreateClient.mockResolvedValue(
      sessionClient as unknown as Awaited<ReturnType<typeof createClient>>
    );

    const adminChain = createChainMock({
      // isPostAlreadyPending: 既に pending だった、を返す
      generated_images: [{ data: { moderation_status: "pending" }, error: null }],
    });
    const adminClient = {
      ...adminChain,
      rpc: jest.fn(async () => ({
        data: null,
        error: { message: "permission denied" },
      })),
    };
    mockCreateAdminClient.mockReturnValue(
      adminClient as unknown as ReturnType<typeof createAdminClient>
    );

    const response = await POST(buildRequest());

    expect(response.status).toBe(200);
    // 再確認のクエリが admin クライアント側に来ていること
    expect(adminChain.from).toHaveBeenCalledWith("generated_images");
  });
});
