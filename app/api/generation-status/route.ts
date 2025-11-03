import { NextRequest, NextResponse } from "next/server";

/**
 * 画像生成ステータス取得API
 * 生成リクエストのステータスを確認する
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const generationId = searchParams.get("id");

    if (!generationId) {
      return NextResponse.json(
        { error: "Generation ID is required" },
        { status: 400 }
      );
    }

    // TODO: Supabaseから生成ステータスを取得
    // 現時点ではプレースホルダー

    return NextResponse.json({
      id: generationId,
      status: "completed",
      message: "Status retrieval not yet implemented",
    });
  } catch (error) {
    console.error("Status check error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

