import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { updateComment, deleteComment } from "@/features/posts/lib/server-api";
import { sanitizeProfileText, validateProfileText } from "@/lib/utils";
import { COMMENT_MAX_LENGTH } from "@/constants";
import { getRouteLocale } from "@/lib/api/route-locale";
import { postsRouteCopy } from "@/features/posts/lib/route-copy";

/**
 * コメント編集・削除API
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const copy = postsRouteCopy[getRouteLocale(request)];
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        { error: copy.authRequired, errorCode: "POSTS_AUTH_REQUIRED" },
        { status: 401 }
      );
    }
    const { id } = await params;
    const body = await request.json();
    const { content } = body;

    if (!id) {
      return NextResponse.json(
        { error: copy.commentIdRequired, errorCode: "POSTS_COMMENT_ID_REQUIRED" },
        { status: 400 }
      );
    }

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: copy.contentRequired, errorCode: "POSTS_COMMENT_CONTENT_REQUIRED" },
        { status: 400 }
      );
    }

    // サニタイズ
    const sanitized = sanitizeProfileText(content);

    // バリデーション（空文字は許可しない）
    const validation = validateProfileText(
      sanitized.value,
      COMMENT_MAX_LENGTH,
      "コメント",
      false,
      {
        required: copy.commentRequired,
        invalidCharacters: copy.commentInvalidCharacters,
        maxLength: copy.commentTooLong(COMMENT_MAX_LENGTH),
      }
    );

    if (!validation.valid) {
      return NextResponse.json(
        {
          error: validation.error || copy.commentUpdateFailed,
          errorCode: "POSTS_COMMENT_INVALID_INPUT",
        },
        { status: 400 }
      );
    }

    // サニタイズ後の値をサーバーサイド関数に渡す
    const comment = await updateComment(id, user.id, sanitized.value);

    return NextResponse.json({ comment });
  } catch (error) {
    console.error("Comment update API error:", error);
    return NextResponse.json(
      {
        error: copy.commentUpdateFailed,
        errorCode: "POSTS_COMMENT_UPDATE_FAILED",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const copy = postsRouteCopy[getRouteLocale(request)];
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        { error: copy.authRequired, errorCode: "POSTS_AUTH_REQUIRED" },
        { status: 401 }
      );
    }
    const { id } = await params;

    console.log("[DELETE /api/comments/[id]] User:", user.id);
    console.log("[DELETE /api/comments/[id]] Comment ID:", id);

    if (!id) {
      return NextResponse.json(
        { error: copy.commentIdRequired, errorCode: "POSTS_COMMENT_ID_REQUIRED" },
        { status: 400 }
      );
    }

    await deleteComment(id, user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Comment deletion API error:", error);
    console.error("Error stack:", error instanceof Error ? error.stack : "");
    return NextResponse.json(
      {
        error: copy.commentDeleteFailed,
        errorCode: "POSTS_COMMENT_DELETE_FAILED",
      },
      { status: 500 }
    );
  }
}
