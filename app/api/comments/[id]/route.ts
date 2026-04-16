import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getUser } from "@/lib/auth";
import {
  deleteComment,
  PostCommentError,
  updateComment,
} from "@/features/posts/lib/server-api";
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
    const userPromise = getUser();
    const paramsPromise = params;
    const bodyPromise = request.json();
    const user = await userPromise;
    if (!user) {
      return NextResponse.json(
        { error: copy.authRequired, errorCode: "POSTS_AUTH_REQUIRED" },
        { status: 401 }
      );
    }
    const [{ id }, body] = await Promise.all([paramsPromise, bodyPromise]);
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
    if (error instanceof PostCommentError) {
      return NextResponse.json(
        { error: error.message, errorCode: error.code },
        { status: error.status }
      );
    }
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
    const userPromise = getUser();
    const paramsPromise = params;
    const user = await userPromise;
    if (!user) {
      return NextResponse.json(
        { error: copy.authRequired, errorCode: "POSTS_AUTH_REQUIRED" },
        { status: 401 }
      );
    }
    const { id } = await paramsPromise;

    if (!id) {
      return NextResponse.json(
        { error: copy.commentIdRequired, errorCode: "POSTS_COMMENT_ID_REQUIRED" },
        { status: 400 }
      );
    }

    const result = await deleteComment(id, user.id);
    revalidateTag(`post-detail-${result.image_id}`, "max");

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PostCommentError) {
      return NextResponse.json(
        { error: error.message, errorCode: error.code },
        { status: error.status }
      );
    }
    console.error("Comment deletion API error:", error);
    return NextResponse.json(
      {
        error: copy.commentDeleteFailed,
        errorCode: "POSTS_COMMENT_DELETE_FAILED",
      },
      { status: 500 }
    );
  }
}
