import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { postImage } from "@/features/generation/lib/database";

/**
 * 投稿API
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth();

    const body = await request.json();
    const { id, caption } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Image ID is required" },
        { status: 400 }
      );
    }

    const result = await postImage(id, caption);

    return NextResponse.json({
      id: result.id!,
      is_posted: result.is_posted,
      caption: result.caption ?? null,
      posted_at: result.posted_at || new Date().toISOString(),
    });
  } catch (error) {
    console.error("Post API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "投稿に失敗しました",
      },
      { status: 500 }
    );
  }
}

