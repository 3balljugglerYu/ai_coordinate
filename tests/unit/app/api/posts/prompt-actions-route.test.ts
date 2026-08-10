/** @jest-environment node */

/**
 * POST /api/posts/prompt-actions のテスト（ADR-005）。
 *
 * ここが誤ると (a) 一覧の payload にプロンプト本文が乗る、
 * (b) 詳細と CTA の可否が食い違う、のいずれかが起きる。
 */

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

jest.mock("@/features/posts/lib/source-prompt-reference", () => ({
  resolveSourcePromptSummaries: jest.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/posts/prompt-actions/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveSourcePromptSummaries } from "@/features/posts/lib/source-prompt-reference";

const mockCreateAdminClient = createAdminClient as jest.MockedFunction<
  typeof createAdminClient
>;
const mockResolve = resolveSourcePromptSummaries as jest.MockedFunction<
  typeof resolveSourcePromptSummaries
>;

const POST_A = "11111111-1111-4111-8111-111111111111";
const POST_B = "22222222-2222-4222-8222-222222222222";
const AUTHOR_ID = "33333333-3333-4333-8333-333333333333";

function buildRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/posts/prompt-actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** generated_images への select を記録するスタブ。 */
function mockQuery(rows: unknown[], error: { message: string } | null = null) {
  const calls: { columns?: string; ids?: string[] } = {};
  const builder = {
    select: jest.fn((columns: string) => {
      calls.columns = columns;
      return builder;
    }),
    in: jest.fn((_column: string, ids: string[]) => {
      calls.ids = ids;
      return Promise.resolve({ data: rows, error });
    }),
  };
  mockCreateAdminClient.mockReturnValue({
    from: jest.fn(() => builder),
  } as unknown as ReturnType<typeof createAdminClient>);
  return calls;
}

describe("POST /api/posts/prompt-actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolve.mockResolvedValue({});
  });

  test("投稿IDのサマリを返す", async () => {
    mockQuery([{ id: POST_A, user_id: AUTHOR_ID, generation_type: "free" }]);
    mockResolve.mockResolvedValue({
      [POST_A]: {
        originPostId: POST_A,
        isAvailable: true,
        originAuthorId: AUTHOR_ID,
        originAuthorNickname: "原作者さん",
        usageCount: 2,
        promptVisibility: "private",
      },
    });

    const response = await POST(buildRequest({ post_ids: [POST_A] }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.summaries[POST_A].originPostId).toBe(POST_A);
  });

  test("本文につながる列は SELECT しない(そもそもメモリに載せない)", async () => {
    const calls = mockQuery([]);

    await POST(buildRequest({ post_ids: [POST_A] }));

    expect(calls.columns).not.toContain("prompt");
    expect(calls.columns).toBe(
      "id, user_id, generation_type, source_post_id, source_author_id"
    );
  });

  test("重複した post_id は1回だけ問い合わせる", async () => {
    const calls = mockQuery([]);

    await POST(buildRequest({ post_ids: [POST_A, POST_A, POST_B] }));

    expect(calls.ids).toEqual([POST_A, POST_B]);
  });

  test("判定は詳細と同じ resolveSourcePromptSummaries に委ねる(一覧側で再実装しない)", async () => {
    const rows = [{ id: POST_A, user_id: AUTHOR_ID, generation_type: "free" }];
    mockQuery(rows);

    await POST(buildRequest({ post_ids: [POST_A] }));

    expect(mockResolve).toHaveBeenCalledWith(rows, expect.anything());
  });

  test.each([
    ["空配列", { post_ids: [] }],
    ["UUID でない", { post_ids: ["nope"] }],
    ["キー違い", { postIds: [POST_A] }],
    ["50件超", { post_ids: Array.from({ length: 51 }, () => POST_A) }],
  ])("不正な body は 400 (%s)", async (_label, body) => {
    mockQuery([]);

    const response = await POST(buildRequest(body));

    expect(response.status).toBe(400);
    expect(mockResolve).not.toHaveBeenCalled();
  });

  test("DB エラーは 500", async () => {
    mockQuery([], { message: "boom" });
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(buildRequest({ post_ids: [POST_A] }));

    expect(response.status).toBe(500);
    expect(mockResolve).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
