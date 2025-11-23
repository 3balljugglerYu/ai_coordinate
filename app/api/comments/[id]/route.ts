import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { updateComment, deleteComment } from "@/features/posts/lib/server-api";

/**
 * コメント編集・削除API
 */
export async function PUT(
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
        { error: "Comment ID is required" },
        { status: 400 }
      );
    }

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 }
      );
    }

    const comment = await updateComment(id, user.id, content);

    return NextResponse.json({ comment });
  } catch (error) {
    console.error("Comment update API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "コメントの編集に失敗しました",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await params;

    console.log("[DELETE /api/comments/[id]] User:", user.id);
    console.log("[DELETE /api/comments/[id]] Comment ID:", id);

    if (!id) {
      return NextResponse.json(
        { error: "Comment ID is required" },
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
        error:
          error instanceof Error
            ? error.message
            : "コメントの削除に失敗しました",
      },
      { status: 500 }
    );
  }
}

