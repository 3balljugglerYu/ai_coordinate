import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getComments, createComment } from "@/features/posts/lib/server-api";
import { sanitizeProfileText, validateProfileText } from "@/lib/utils";

/**
 * コメント一覧取得・コメント投稿API
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    if (!id) {
      return NextResponse.json(
        { error: "Image ID is required" },
        { status: 400 }
      );
    }

    if (limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: "Limit must be between 1 and 100" },
        { status: 400 }
      );
    }

    if (offset < 0) {
      return NextResponse.json(
        { error: "Offset must be non-negative" },
        { status: 400 }
      );
    }

    const comments = await getComments(id, limit, offset);

    return NextResponse.json({ comments });
  } catch (error) {
    console.error("Comments API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "コメントの取得に失敗しました",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const { content } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Image ID is required" },
        { status: 400 }
      );
    }

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 }
      );
    }

    // サニタイズ
    const sanitized = sanitizeProfileText(content);

    // バリデーション（空文字は許可しない）
    const validation = validateProfileText(
      sanitized.value,
      200, // MAX_LENGTH
      "コメント",
      false // 空文字を許可しない
    );

    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    // サニタイズ後の値をサーバーサイド関数に渡す
    const comment = await createComment(id, user.id, sanitized.value);

    return NextResponse.json({ comment });
  } catch (error) {
    console.error("Comment creation API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "コメントの投稿に失敗しました",
      },
      { status: 500 }
    );
  }
}

