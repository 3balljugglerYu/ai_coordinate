import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { unpostImageServer } from "@/features/generation/lib/server-database";

/**
 * 投稿取り消しAPI（投稿詳細画面から）
 * 投稿一覧からは削除されるが、マイページには残る
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Image ID is required" },
        { status: 400 }
      );
    }

    await unpostImageServer(id, user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unpost API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "投稿の取り消しに失敗しました",
      },
      { status: 500 }
    );
  }
}

