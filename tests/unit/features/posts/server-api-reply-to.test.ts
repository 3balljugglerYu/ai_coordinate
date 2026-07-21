/** @jest-environment node */

import { createReply, PostCommentError } from "@/features/posts/lib/server-api";

jest.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(() => {
    throw new Error("should not reach supabase for invalid replyToCommentId");
  }),
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

describe("createReply の replyToCommentId 事前検証", () => {
  test.each([
    ["UUID形式でない文字列", "not-a-uuid"],
    ["空文字", ""],
    ["SQL断片", "1; DROP TABLE comments"],
  ])(
    "replyToCommentIdが不正(%s)の場合_DBへ到達せずPOSTS_REPLY_TO_INVALIDを投げる",
    async (_label, invalidId) => {
      await expect(
        createReply("comment-1", "user-1", "body", invalidId)
      ).rejects.toMatchObject({
        name: "PostCommentError",
        status: 400,
        code: "POSTS_REPLY_TO_INVALID",
      });
    }
  );

  test("PostCommentErrorのインスタンスとして投げられる", async () => {
    await expect(
      createReply("comment-1", "user-1", "body", "invalid")
    ).rejects.toBeInstanceOf(PostCommentError);
  });
});
