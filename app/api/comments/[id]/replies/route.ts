import { connection, NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getUser } from "@/lib/auth";
import {
  createReply,
  getReplies,
  PostCommentError,
} from "@/features/posts/lib/server-api";
import { sanitizeProfileText, validateProfileText } from "@/lib/utils";
import { COMMENT_MAX_LENGTH } from "@/constants";
import { getRouteLocale } from "@/lib/api/route-locale";
import { postsRouteCopy } from "@/features/posts/lib/route-copy";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  const copy = postsRouteCopy[getRouteLocale(request)];

  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    if (!id) {
      return NextResponse.json(
        { error: copy.commentIdRequired, errorCode: "POSTS_COMMENT_ID_REQUIRED" },
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

    const replies = await getReplies(id, limit, offset);
    return NextResponse.json({ replies });
  } catch (error) {
    if (error instanceof PostCommentError) {
      return NextResponse.json(
        { error: error.message, errorCode: error.code },
        { status: error.status }
      );
    }

    console.error("Replies API error:", error);
    return NextResponse.json(
      {
        error: copy.commentsFetchFailed,
        errorCode: "POSTS_REPLIES_FETCH_FAILED",
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

    const sanitized = sanitizeProfileText(content);
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

    const reply = await createReply(id, user.id, sanitized.value);
    revalidateTag(`post-detail-${reply.image_id}`, { expire: 0 });

    return NextResponse.json({ reply });
  } catch (error) {
    if (error instanceof PostCommentError) {
      return NextResponse.json(
        { error: error.message, errorCode: error.code },
        { status: error.status }
      );
    }

    console.error("Reply creation API error:", error);
    return NextResponse.json(
      {
        error: copy.commentCreateFailed,
        errorCode: "POSTS_REPLY_CREATE_FAILED",
      },
      { status: 500 }
    );
  }
}
