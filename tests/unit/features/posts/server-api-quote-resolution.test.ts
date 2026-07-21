/** @jest-environment node */

import {
  createReply,
  getReplies,
  updateComment,
} from "@/features/posts/lib/server-api";

jest.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

// createClient(セッション)/createAdminClient(管理)の両方を同一のフェイクに
// 向け、テーブルごとのレスポンスキューで呼び出し順に応答する。
let supabaseMock: { from: jest.Mock };

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(async () => supabaseMock),
}));

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(() => supabaseMock),
}));

jest.mock("@/lib/auth", () => ({
  getUser: jest.fn(),
}));

jest.mock("@/lib/env", () => ({
  getAdminUserIds: jest.fn(() => []),
  isFullAdmin: jest.fn(() => false),
}));

jest.mock("@/features/generation/lib/prompt-visibility", () => ({
  redactSensitivePrompt: (post: unknown) => post,
}));

type MockResponse = { data: unknown; error: { message: string } | null };

function createSupabaseMock(queues: Record<string, MockResponse[]>) {
  return {
    from: jest.fn((table: string) => {
      const response =
        (queues[table] ?? []).shift() ??
        ({ data: null, error: { message: `no mock for ${table}` } } as MockResponse);
      const builder: Record<string, unknown> = {};
      const chain = jest.fn(() => builder);
      for (const method of [
        "select",
        "eq",
        "is",
        "in",
        "order",
        "range",
        "single",
        "maybeSingle",
        "insert",
        "update",
      ]) {
        builder[method] = chain;
      }
      // どのチェーン末尾で await されても同じレスポンスを返す thenable。
      builder.then = (
        resolve: (value: MockResponse) => unknown,
        reject: (reason: unknown) => unknown
      ) => Promise.resolve(response).then(resolve, reject);
      return builder;
    }),
  };
}

function commentRow(
  id: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id,
    user_id: "user-1",
    image_id: "post-1",
    parent_comment_id: "parent-1",
    reply_to_comment_id: null,
    reply_to_deleted: false,
    content: `content ${id}`,
    created_at: "2026-04-16T00:00:00.000Z",
    updated_at: "2026-04-16T00:00:00.000Z",
    deleted_at: null,
    last_activity_at: "2026-04-16T00:00:00.000Z",
    ...overrides,
  };
}

const PROFILES = {
  data: [
    { user_id: "user-1", nickname: "taro", avatar_url: null, subscription_plan: "free" },
    { user_id: "user-9", nickname: "hanako", avatar_url: "https://example.com/h.webp", subscription_plan: "free" },
  ],
  error: null,
};

describe("getReplies の引用解決", () => {
  test("引用先が存命の場合_reply_toに最新プロフィールとプレビューを合成する", async () => {
    supabaseMock = createSupabaseMock({
      comments: [
        {
          data: [
            commentRow("r2", { reply_to_comment_id: "r1" }),
            commentRow("r3"),
          ],
          error: null,
        },
        { data: [commentRow("r1", { user_id: "user-9" })], error: null },
      ],
      profiles: [PROFILES],
    });

    const replies = await getReplies("parent-1", 20, 0);

    expect(replies[0].reply_to).toEqual({
      user_id: "user-9",
      nickname: "hanako",
      avatar_url: "https://example.com/h.webp",
      content_preview: "content r1",
    });
    expect(replies[0].reply_to_deleted).toBe(false);
    // 引用なしの返信には引用情報が付かない
    expect(replies[1].reply_to).toBeNull();
    expect(replies[1].reply_to_deleted).toBe(false);
  });

  test("引用先本文が80文字を超える場合_プレビューを省略記号付きで切り詰める", async () => {
    const longContent = "あ".repeat(100);
    supabaseMock = createSupabaseMock({
      comments: [
        { data: [commentRow("r2", { reply_to_comment_id: "r1" })], error: null },
        {
          data: [commentRow("r1", { user_id: "user-9", content: longContent })],
          error: null,
        },
      ],
      profiles: [PROFILES],
    });

    const replies = await getReplies("parent-1", 20, 0);

    expect(replies[0].reply_to?.content_preview).toBe(`${"あ".repeat(80)}...`);
  });

  test("引用先が見つからない場合_削除済み扱いでフォールバックする", async () => {
    supabaseMock = createSupabaseMock({
      comments: [
        { data: [commentRow("r2", { reply_to_comment_id: "gone" })], error: null },
        { data: [], error: null },
      ],
      profiles: [PROFILES],
    });

    const replies = await getReplies("parent-1", 20, 0);

    expect(replies[0].reply_to).toBeNull();
    expect(replies[0].reply_to_deleted).toBe(true);
  });

  test("引用先がtombstoneの場合_削除済み扱いでフォールバックする", async () => {
    supabaseMock = createSupabaseMock({
      comments: [
        { data: [commentRow("r2", { reply_to_comment_id: "r1" })], error: null },
        {
          data: [
            commentRow("r1", {
              user_id: "user-9",
              deleted_at: "2026-04-17T00:00:00.000Z",
            }),
          ],
          error: null,
        },
      ],
      profiles: [PROFILES],
    });

    const replies = await getReplies("parent-1", 20, 0);

    expect(replies[0].reply_to).toBeNull();
    expect(replies[0].reply_to_deleted).toBe(true);
  });

  test("引用先lookupが失敗した場合_削除済みと誤表示せず引用ヘッダーのみ非表示にする", async () => {
    supabaseMock = createSupabaseMock({
      comments: [
        { data: [commentRow("r2", { reply_to_comment_id: "r1" })], error: null },
        { data: null, error: { message: "network error" } },
      ],
      profiles: [PROFILES],
    });

    const replies = await getReplies("parent-1", 20, 0);

    // 一覧自体は返り、reply_to_deleted は DB のフラグ(false)のまま
    expect(replies).toHaveLength(1);
    expect(replies[0].reply_to).toBeNull();
    expect(replies[0].reply_to_deleted).toBe(false);
  });
});

describe("createReply の引用リプライ", () => {
  const PARENT_LOOKUP = {
    data: {
      id: "parent-1",
      image_id: "post-1",
      parent_comment_id: null,
      deleted_at: null,
    },
    error: null,
  };

  test("トリガーの REPLY_TO_* エラーを PostCommentError(400) にマッピングする", async () => {
    for (const [dbMessage, code] of [
      ["REPLY_TO_NOT_FOUND: reply target comment not found", "POSTS_REPLY_TO_NOT_FOUND"],
      ["REPLY_TO_INVALID_TARGET: reply target must be a reply in the same thread", "POSTS_REPLY_TO_INVALID"],
      ["REPLY_TO_DELETED: cannot quote a deleted comment", "POSTS_REPLY_TO_DELETED"],
    ] as const) {
      supabaseMock = createSupabaseMock({
        comments: [PARENT_LOOKUP, { data: null, error: { message: dbMessage } }],
      });

      await expect(
        createReply(
          "parent-1",
          "user-1",
          "body",
          "11111111-2222-4333-8444-555555555555"
        )
      ).rejects.toMatchObject({ name: "PostCommentError", status: 400, code });
    }
  });

  test("作成成功時_レスポンスに引用情報を合成して返す", async () => {
    supabaseMock = createSupabaseMock({
      comments: [
        PARENT_LOOKUP,
        {
          data: commentRow("new-reply", { reply_to_comment_id: "r1" }),
          error: null,
        },
        { data: [commentRow("r1", { user_id: "user-9" })], error: null },
      ],
      profiles: [PROFILES],
    });

    const created = await createReply(
      "parent-1",
      "user-1",
      "body",
      "11111111-2222-4333-8444-555555555555"
    );

    expect(created.reply_to_comment_id).toBe("r1");
    expect(created.reply_to?.nickname).toBe("hanako");
    expect(created.user_nickname).toBe("taro");
  });
});

describe("updateComment の返信編集", () => {
  test("引用リプライの編集後レスポンスにも引用情報を合成する", async () => {
    supabaseMock = createSupabaseMock({
      comments: [
        // 既存コメント lookup(返信・本人)
        {
          data: commentRow("r2", {
            reply_to_comment_id: "r1",
            parent_comment_id: "parent-1",
          }),
          error: null,
        },
        // update 結果
        {
          data: commentRow("r2", {
            reply_to_comment_id: "r1",
            content: "edited",
          }),
          error: null,
        },
        // 引用先 lookup
        { data: [commentRow("r1", { user_id: "user-9" })], error: null },
      ],
      profiles: [PROFILES],
    });

    const updated = await updateComment("r2", "user-1", "edited");

    expect("reply_to" in updated && updated.reply_to?.nickname).toBe("hanako");
    expect(updated.content).toBe("edited");
  });
});
