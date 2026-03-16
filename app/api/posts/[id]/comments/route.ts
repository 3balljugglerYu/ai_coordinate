import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getUser } from "@/lib/auth";
import { getComments, createComment } from "@/features/posts/lib/server-api";
import { sanitizeProfileText, validateProfileText } from "@/lib/utils";
import { COMMENT_MAX_LENGTH } from "@/constants";
import { getRouteLocale } from "@/lib/api/route-locale";
import { postsRouteCopy } from "@/features/posts/lib/route-copy";

/**
 * コメント一覧取得・コメント投稿API
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const copy = postsRouteCopy[getRouteLocale(request)];
  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    if (!id) {
      return NextResponse.json(
        { error: copy.imageIdRequired, errorCode: "POSTS_IMAGE_ID_REQUIRED" },
        { status: 400 }
      );
    }

    if (limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: copy.invalidLimit, errorCode: "POSTS_INVALID_LIMIT" },
        { status: 400 }
      );
    }

    if (offset < 0) {
      return NextResponse.json(
        { error: copy.invalidOffset, errorCode: "POSTS_INVALID_OFFSET" },
        { status: 400 }
      );
    }

    const comments = await getComments(id, limit, offset);

    return NextResponse.json({ comments });
  } catch (error) {
    console.error("Comments API error:", error);
    return NextResponse.json(
      {
        error: copy.commentsFetchFailed,
        errorCode: "POSTS_COMMENTS_FETCH_FAILED",
      },
      { status: 500 }
    );
  }
}

export async function POST(
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
        { error: copy.imageIdRequired, errorCode: "POSTS_IMAGE_ID_REQUIRED" },
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
          error: validation.error || copy.commentCreateFailed,
          errorCode: "POSTS_COMMENT_INVALID_INPUT",
        },
        { status: 400 }
      );
    }

    // サニタイズ後の値をサーバーサイド関数に渡す
    const comment = await createComment(id, user.id, sanitized.value);

    revalidateTag(`post-detail-${id}`, "max");
    return NextResponse.json({ comment });
  } catch (error) {
    console.error("Comment creation API error:", error);
    return NextResponse.json(
      {
        error: copy.commentCreateFailed,
        errorCode: "POSTS_COMMENT_CREATE_FAILED",
      },
      { status: 500 }
    );
  }
}
