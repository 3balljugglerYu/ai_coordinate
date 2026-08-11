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

jest.mock("@/features/style/lib/style-popularity", () => ({
  getStyleGenerateTotalCounts: jest.fn(async () => ({ "preset-1": 42 })),
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
function mockQuery(
  rows: unknown[],
  error: { message: string } | null = null,
  presetRows: unknown[] = []
) {
  const calls: {
    columns?: string;
    ids?: string[];
    filters: [string, unknown][];
    presetIds?: string[];
  } = { filters: [] };

  const imagesBuilder = {
    select: jest.fn((columns: string) => {
      calls.columns = columns;
      return imagesBuilder;
    }),
    in: jest.fn((_column: string, ids: string[]) => {
      calls.ids = ids;
      return imagesBuilder;
    }),
    eq: jest.fn((column: string, value: unknown) => {
      calls.filters.push([column, value]);
      // 実装は .in(...).eq(...).eq(...) の最後で await するため、
      // 可視性フィルタが2つ揃った時点で結果を返す
      return calls.filters.length >= 2
        ? Promise.resolve({ data: rows, error })
        : imagesBuilder;
    }),
  };

  const presetsBuilder = {
    select: jest.fn(() => presetsBuilder),
    in: jest.fn((_column: string, ids: string[]) => {
      calls.presetIds = ids;
      return presetsBuilder;
    }),
    eq: jest.fn(() => Promise.resolve({ data: presetRows, error: null })),
  };

  mockCreateAdminClient.mockReturnValue({
    from: jest.fn((table: string) =>
      table === "style_presets" ? presetsBuilder : imagesBuilder
    ),
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
      "id, user_id, generation_type, source_post_id, source_author_id, generation_metadata"
    );
  });

  describe("One-Tap Style の引用元リンク", () => {
    const oneTapRow = {
      id: POST_A,
      user_id: AUTHOR_ID,
      generation_type: "one_tap_style",
      source_post_id: null,
      source_author_id: null,
      generation_metadata: {
        oneTapStyle: {
          id: "preset-1",
          title: "夏のマリンコーデ",
          thumbnailImageUrl: "https://example.test/p.png",
          thumbnailWidth: 300,
          thumbnailHeight: 400,
          hasBackgroundPrompt: false,
          billingMode: "free",
          outputAspectRatioMode: "portrait",
        },
      },
    };

    test("公開カテゴリのプリセットは slug を返す", async () => {
      mockQuery([oneTapRow], null, [
        {
          id: "preset-1",
          slug: "summer-marine",
          category: {
            visibility: "public",
            collection_display_starts_at: null,
            collection_display_ends_at: null,
          },
        },
      ]);

      const response = await POST(buildRequest({ post_ids: [POST_A] }));
      const body = await response.json();

      expect(body.styleLinks[POST_A]).toEqual({
        presetId: "preset-1",
        slug: "summer-marine",
        // 累計回数は /style の探索シートと同じ値を使う
        usageCount: 42,
      });
    });

    test("admin_only カテゴリは slug を返さない(404 に飛ばさない)", async () => {
      mockQuery([oneTapRow], null, [
        {
          id: "preset-1",
          slug: "secret-style",
          category: {
            visibility: "admin_only",
            collection_display_starts_at: null,
            collection_display_ends_at: null,
          },
        },
      ]);

      const response = await POST(buildRequest({ post_ids: [POST_A] }));
      const body = await response.json();

      expect(body.styleLinks[POST_A]).toEqual({
        presetId: "preset-1",
        slug: null,
        usageCount: 42,
      });
    });

    test("未公開(published でない)プリセットも slug を返さない", async () => {
      mockQuery([oneTapRow], null, []);

      const response = await POST(buildRequest({ post_ids: [POST_A] }));
      const body = await response.json();

      expect(body.styleLinks[POST_A]).toEqual({
        presetId: "preset-1",
        slug: null,
        usageCount: 42,
      });
    });

    test("One-Tap でない投稿だけならプリセットを問い合わせない", async () => {
      const calls = mockQuery([
        {
          id: POST_A,
          user_id: AUTHOR_ID,
          generation_type: "free",
          source_post_id: null,
          source_author_id: null,
          generation_metadata: null,
        },
      ]);

      await POST(buildRequest({ post_ids: [POST_A] }));

      expect(calls.presetIds).toBeUndefined();
    });
  });

  test("公開中の投稿だけを resolver に渡す(既知UUIDで系譜メタデータを引き出せない)", async () => {
    // admin クライアントは RLS を迂回するため、未投稿・公開停止の行を
    // 明示的に除外しないと、取り消した投稿の原作者や利用数まで返せてしまう
    const calls = mockQuery([]);

    await POST(buildRequest({ post_ids: [POST_A] }));

    expect(calls.filters).toEqual([
      ["is_posted", true],
      ["moderation_status", "visible"],
    ]);
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
