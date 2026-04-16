/** @jest-environment node */

import type { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import {
  GET as getRepliesRoute,
  POST as postReplyRoute,
} from "@/app/api/comments/[id]/replies/route";
import {
  PUT as putCommentRoute,
  DELETE as deleteCommentRoute,
} from "@/app/api/comments/[id]/route";
import { getUser } from "@/lib/auth";
import {
  createReply,
  deleteComment,
  getReplies,
  PostCommentError,
  updateComment,
} from "@/features/posts/lib/server-api";
import { getRouteLocale } from "@/lib/api/route-locale";

jest.mock("next/cache");
jest.mock("@/lib/auth");
jest.mock("@/lib/api/route-locale");
jest.mock("@/features/posts/lib/server-api", () => {
  const actual = jest.requireActual("@/features/posts/lib/server-api");

  return {
    ...actual,
    createReply: jest.fn(),
    deleteComment: jest.fn(),
    getReplies: jest.fn(),
    updateComment: jest.fn(),
  };
});

const mockRevalidateTag = revalidateTag as jest.MockedFunction<
  typeof revalidateTag
>;
const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockCreateReply = createReply as jest.MockedFunction<typeof createReply>;
const mockDeleteComment = deleteComment as jest.MockedFunction<
  typeof deleteComment
>;
const mockGetReplies = getReplies as jest.MockedFunction<typeof getReplies>;
const mockUpdateComment = updateComment as jest.MockedFunction<
  typeof updateComment
>;
const mockGetRouteLocale = getRouteLocale as jest.MockedFunction<
  typeof getRouteLocale
>;

function createRequest(
  method: "GET" | "POST" | "PUT" | "DELETE",
  body?: Record<string, unknown>,
  searchParams?: Record<string, string>
): NextRequest {
  const url = new URL("http://localhost/api/test");

  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  const request = new Request(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "accept-language": "ja",
    },
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest;

  Object.defineProperty(request, "nextUrl", {
    value: url,
  });

  return request;
}

describe("Comment reply route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRouteLocale.mockReturnValue("ja");
    mockGetUser.mockResolvedValue({
      id: "user-1",
      email: "user-1@example.com",
    } as never);
    mockRevalidateTag.mockImplementation(() => {});
  });

  test("GET /api/comments/[id]/replies_返信が存在しない場合_空配列を返す", async () => {
    mockGetReplies.mockResolvedValue([]);

    const response = await getRepliesRoute(
      createRequest("GET", undefined, { limit: "20", offset: "0" }),
      { params: Promise.resolve({ id: "comment-1" }) }
    );
    const body = (await response.json()) as { replies: unknown[] };

    expect(response.status).toBe(200);
    expect(body.replies).toEqual([]);
    expect(mockGetReplies).toHaveBeenCalledWith("comment-1", 20, 0);
  });

  test("GET /api/comments/[id]/replies_返信が存在する場合_getRepliesの結果を返す", async () => {
    mockGetReplies.mockResolvedValue([
      {
        id: "reply-1",
        user_id: "user-2",
        image_id: "post-1",
        parent_comment_id: "comment-1",
        content: "first reply",
        created_at: "2026-04-16T00:00:00.000Z",
        updated_at: "2026-04-16T00:00:00.000Z",
        deleted_at: null,
        user_nickname: "Reply User",
        user_avatar_url: null,
      },
    ]);

    const response = await getRepliesRoute(
      createRequest("GET", undefined, { limit: "20", offset: "5" }),
      { params: Promise.resolve({ id: "comment-1" }) }
    );
    const body = (await response.json()) as {
      replies: Array<{ id: string; parent_comment_id: string | null }>;
    };

    expect(response.status).toBe(200);
    expect(body.replies).toEqual([
      expect.objectContaining({
        id: "reply-1",
        parent_comment_id: "comment-1",
      }),
    ]);
    expect(mockGetReplies).toHaveBeenCalledWith("comment-1", 20, 5);
  });

  test("GET /api/comments/[id]/replies_limitが不正な場合_400を返す", async () => {
    const response = await getRepliesRoute(
      createRequest("GET", undefined, { limit: "101", offset: "0" }),
      { params: Promise.resolve({ id: "comment-1" }) }
    );
    const body = (await response.json()) as { errorCode: string };

    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("POSTS_INVALID_LIMIT");
    expect(mockGetReplies).not.toHaveBeenCalled();
  });

  test("GET /api/comments/[id]/replies_offsetが不正な場合_400を返す", async () => {
    const response = await getRepliesRoute(
      createRequest("GET", undefined, { limit: "20", offset: "-1" }),
      { params: Promise.resolve({ id: "comment-1" }) }
    );
    const body = (await response.json()) as { errorCode: string };

    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("POSTS_INVALID_OFFSET");
    expect(mockGetReplies).not.toHaveBeenCalled();
  });

  test("GET /api/comments/[id]/replies_commentIdが欠落している場合_400を返す", async () => {
    const response = await getRepliesRoute(
      createRequest("GET"),
      { params: Promise.resolve({ id: "" }) }
    );
    const body = (await response.json()) as { errorCode: string };

    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("POSTS_COMMENT_ID_REQUIRED");
    expect(mockGetReplies).not.toHaveBeenCalled();
  });

  test("POST /api/comments/[id]/replies_返信作成時_投稿詳細タグを再検証する", async () => {
    mockCreateReply.mockResolvedValue({
      id: "reply-1",
      user_id: "user-1",
      image_id: "post-1",
      parent_comment_id: "comment-1",
      content: "reply body",
      created_at: "2026-04-16T00:00:00.000Z",
      updated_at: "2026-04-16T00:00:00.000Z",
      deleted_at: null,
      user_nickname: "User",
      user_avatar_url: null,
    });

    const response = await postReplyRoute(
      createRequest("POST", { content: "reply body" }),
      { params: Promise.resolve({ id: "comment-1" }) }
    );
    const body = (await response.json()) as { reply: { id: string } };

    expect(response.status).toBe(200);
    expect(body.reply.id).toBe("reply-1");
    expect(mockCreateReply).toHaveBeenCalledWith("comment-1", "user-1", "reply body");
    expect(mockRevalidateTag).toHaveBeenCalledWith("post-detail-post-1", "max");
  });

  test("POST /api/comments/[id]/replies_未認証の場合_401を返す", async () => {
    mockGetUser.mockResolvedValue(null);

    const response = await postReplyRoute(
      createRequest("POST", { content: "reply body" }),
      { params: Promise.resolve({ id: "comment-1" }) }
    );
    const body = (await response.json()) as { errorCode: string };

    expect(response.status).toBe(401);
    expect(body.errorCode).toBe("POSTS_AUTH_REQUIRED");
    expect(mockCreateReply).not.toHaveBeenCalled();
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  test("POST /api/comments/[id]/replies_contentが不正な場合_400を返す", async () => {
    const response = await postReplyRoute(
      createRequest("POST", { content: "a".repeat(1000) }),
      { params: Promise.resolve({ id: "comment-1" }) }
    );
    const body = (await response.json()) as { errorCode: string };

    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("POSTS_COMMENT_INVALID_INPUT");
    expect(mockCreateReply).not.toHaveBeenCalled();
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  test.each([
    [
      "POSTS_REPLY_PARENT_NOT_FOUND",
      404,
      "返信先のコメントが見つかりません",
    ],
    [
      "POSTS_REPLY_PARENT_INVALID",
      400,
      "返信は親コメントにのみ投稿できます",
    ],
    [
      "POSTS_REPLY_PARENT_DELETED",
      409,
      "削除済みコメントには返信できません",
    ],
  ])(
    "POST /api/comments/[id]/replies_createReplyが%sを返す場合_そのまま応答する",
    async (errorCode, status, message) => {
      mockCreateReply.mockRejectedValue(
        new PostCommentError(message, status, errorCode)
      );

      const response = await postReplyRoute(
        createRequest("POST", { content: "reply body" }),
        { params: Promise.resolve({ id: "comment-1" }) }
      );
      const body = (await response.json()) as { errorCode: string; error: string };

      expect(response.status).toBe(status);
      expect(body.errorCode).toBe(errorCode);
      expect(body.error).toBe(message);
      expect(mockRevalidateTag).not.toHaveBeenCalled();
    }
  );
});

describe("Comment edit/delete route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRouteLocale.mockReturnValue("ja");
    mockGetUser.mockResolvedValue({
      id: "user-1",
      email: "user-1@example.com",
    } as never);
    mockRevalidateTag.mockImplementation(() => {});
  });

  test("PUT /api/comments/[id]_返信コメント更新時_reply形状を返す", async () => {
    mockUpdateComment.mockResolvedValue({
      id: "reply-1",
      user_id: "user-1",
      image_id: "post-1",
      parent_comment_id: "comment-1",
      content: "updated reply",
      created_at: "2026-04-16T00:00:00.000Z",
      updated_at: "2026-04-16T00:10:00.000Z",
      deleted_at: null,
      user_nickname: "User",
      user_avatar_url: null,
    });

    const response = await putCommentRoute(
      createRequest("PUT", { content: "updated reply" }),
      { params: Promise.resolve({ id: "reply-1" }) }
    );
    const body = (await response.json()) as { comment: { id: string; parent_comment_id: string | null } };

    expect(response.status).toBe(200);
    expect(body.comment).toEqual(
      expect.objectContaining({
        id: "reply-1",
        parent_comment_id: "comment-1",
      })
    );
    expect(mockUpdateComment).toHaveBeenCalledWith("reply-1", "user-1", "updated reply");
  });

  test("PUT /api/comments/[id]_親コメント更新時_更新後コメントを返す", async () => {
    mockUpdateComment.mockResolvedValue({
      id: "comment-1",
      user_id: "user-1",
      image_id: "post-1",
      parent_comment_id: null,
      content: "updated parent comment",
      created_at: "2026-04-16T00:00:00.000Z",
      updated_at: "2026-04-16T00:05:00.000Z",
      deleted_at: null,
      user_nickname: "User",
      user_avatar_url: null,
    });

    const response = await putCommentRoute(
      createRequest("PUT", { content: "updated parent comment" }),
      { params: Promise.resolve({ id: "comment-1" }) }
    );
    const body = (await response.json()) as {
      comment: { id: string; parent_comment_id: string | null; content: string };
    };

    expect(response.status).toBe(200);
    expect(body.comment).toEqual(
      expect.objectContaining({
        id: "comment-1",
        parent_comment_id: null,
        content: "updated parent comment",
      })
    );
    expect(mockUpdateComment).toHaveBeenCalledWith(
      "comment-1",
      "user-1",
      "updated parent comment"
    );
  });

  test("PUT /api/comments/[id]_contentが不正な場合_400を返す", async () => {
    const response = await putCommentRoute(
      createRequest("PUT", { content: "a".repeat(1000) }),
      { params: Promise.resolve({ id: "comment-1" }) }
    );
    const body = (await response.json()) as { errorCode: string };

    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("POSTS_COMMENT_INVALID_INPUT");
    expect(mockUpdateComment).not.toHaveBeenCalled();
  });

  test.each([
    ["POSTS_COMMENT_NOT_FOUND", 404, "コメントが見つかりません"],
    ["POSTS_COMMENT_FORBIDDEN", 403, "コメントを編集する権限がありません"],
    ["POSTS_COMMENT_ALREADY_DELETED", 409, "削除済みコメントは編集できません"],
  ])(
    "PUT /api/comments/[id]_updateCommentが%sを返す場合_そのまま応答する",
    async (errorCode, status, message) => {
      mockUpdateComment.mockRejectedValue(
        new PostCommentError(message, status, errorCode)
      );

      const response = await putCommentRoute(
        createRequest("PUT", { content: "updated body" }),
        { params: Promise.resolve({ id: "comment-1" }) }
      );
      const body = (await response.json()) as { errorCode: string; error: string };

      expect(response.status).toBe(status);
      expect(body.errorCode).toBe(errorCode);
      expect(body.error).toBe(message);
    }
  );

  test("DELETE /api/comments/[id]_コメント削除時_投稿詳細タグを再検証する", async () => {
    mockDeleteComment.mockResolvedValue({
      comment_id: "comment-1",
      image_id: "post-1",
      parent_comment_id: null,
      deleted: "logical",
    });

    const response = await deleteCommentRoute(createRequest("DELETE"), {
      params: Promise.resolve({ id: "comment-1" }),
    });
    const body = (await response.json()) as { deleted: string };

    expect(response.status).toBe(200);
    expect(body.deleted).toBe("logical");
    expect(mockDeleteComment).toHaveBeenCalledWith("comment-1", "user-1");
    expect(mockRevalidateTag).toHaveBeenCalledWith("post-detail-post-1", "max");
  });

  test("DELETE /api/comments/[id]_physical削除結果でもdeletedをそのまま返す", async () => {
    mockDeleteComment.mockResolvedValue({
      comment_id: "comment-1",
      image_id: "post-1",
      parent_comment_id: null,
      deleted: "physical",
    });

    const response = await deleteCommentRoute(createRequest("DELETE"), {
      params: Promise.resolve({ id: "comment-1" }),
    });
    const body = (await response.json()) as { deleted: string };

    expect(response.status).toBe(200);
    expect(body.deleted).toBe("physical");
  });

  test("DELETE /api/comments/[id]_未認証の場合_401を返す", async () => {
    mockGetUser.mockResolvedValue(null);

    const response = await deleteCommentRoute(createRequest("DELETE"), {
      params: Promise.resolve({ id: "comment-1" }),
    });
    const body = (await response.json()) as { errorCode: string };

    expect(response.status).toBe(401);
    expect(body.errorCode).toBe("POSTS_AUTH_REQUIRED");
    expect(mockDeleteComment).not.toHaveBeenCalled();
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  test("DELETE /api/comments/[id]_commentIdが欠落している場合_400を返す", async () => {
    const response = await deleteCommentRoute(createRequest("DELETE"), {
      params: Promise.resolve({ id: "" }),
    });
    const body = (await response.json()) as { errorCode: string };

    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("POSTS_COMMENT_ID_REQUIRED");
    expect(mockDeleteComment).not.toHaveBeenCalled();
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  test.each([
    ["POSTS_COMMENT_FORBIDDEN", 403, "コメントを削除する権限がありません"],
    ["POSTS_COMMENT_NOT_FOUND", 404, "コメントが見つかりません"],
    ["POSTS_COMMENT_ALREADY_DELETED", 409, "削除済みコメントは操作できません"],
  ])(
    "DELETE /api/comments/[id]_deleteCommentが%sを返す場合_再検証せずclient errorを返す",
    async (errorCode, status, message) => {
      mockDeleteComment.mockRejectedValue(
        new PostCommentError(message, status, errorCode)
      );

      const response = await deleteCommentRoute(createRequest("DELETE"), {
        params: Promise.resolve({ id: "comment-1" }),
      });
      const body = (await response.json()) as { errorCode: string; error: string };

      expect(response.status).toBe(status);
      expect(body.errorCode).toBe(errorCode);
      expect(body.error).toBe(message);
      expect(mockRevalidateTag).not.toHaveBeenCalled();
    }
  );
});
