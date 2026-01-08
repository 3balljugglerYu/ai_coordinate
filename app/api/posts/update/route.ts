import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { postImageServer } from "@/features/generation/lib/server-database";
import { createClient } from "@/lib/supabase/server";

/**
 * キャプション更新API
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await requireAuth();

    const body = await request.json();
    const { id, caption } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Image ID is required" },
        { status: 400 }
      );
    }

    // キャプション更新処理
    const result = await postImageServer(id, caption);

    // 注意: デイリーボーナスは新しい投稿（POST /api/posts/post）でのみ付与されます
    // キャプション更新（PUT /api/posts/update）ではボーナスを付与しません

    return NextResponse.json({
      id: result.id!,
      is_posted: result.is_posted,
      caption: result.caption ?? null,
      posted_at: result.posted_at || new Date().toISOString(),
    });
  } catch (error) {
    console.error("Update API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "更新に失敗しました",
      },
      { status: 500 }
    );
  }
}

