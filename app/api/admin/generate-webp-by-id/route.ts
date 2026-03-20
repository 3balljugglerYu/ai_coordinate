import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ensureWebPVariants } from "@/features/generation/lib/webp-storage";

/**
 * 特定の画像IDを指定してWebP生成を実行するAPI
 * バッチ処理で処理できなかった画像を個別に処理するために使用
 */
export async function POST(request: NextRequest) {
  try {
    try {
      await requireAdmin();
    } catch (error) {
      if (error instanceof NextResponse) {
        return error;
      }
      throw error;
    }

    const body = await request.json();
    const { imageId } = body;

    if (!imageId) {
      return NextResponse.json(
        { error: "imageId is required" },
        { status: 400 }
      );
    }

    const result = await ensureWebPVariants(imageId);
    if (result.status === "skipped" && result.reason === "image-not-found") {
      return NextResponse.json(
        { error: "画像が見つかりません" },
        { status: 404 }
      );
    }

    if (result.status === "skipped" && result.reason === "missing-source") {
      return NextResponse.json(
        { error: "画像URLまたはストレージパスが存在しません" },
        { status: 400 }
      );
    }

    if (result.status === "skipped") {
      return NextResponse.json({
        success: true,
        message: "既にWebPが生成されています",
        imageId,
        skipped: true,
      });
    }

    return NextResponse.json({
      success: true,
      imageId,
      thumbPath: result.thumbPath,
      displayPath: result.displayPath,
    });
  } catch (error) {
    console.error("WebP生成エラー:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "WebP生成に失敗しました",
        success: false,
      },
      { status: 500 }
    );
  }
}
