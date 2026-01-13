import { NextRequest, NextResponse } from "next/server";
import { uploadWebPVariants, updateWebPStoragePaths } from "@/features/generation/lib/webp-storage";

/**
 * WebP生成API Route
 * 画像をWebP形式に変換してSupabase Storageにアップロード
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrl, imageId, storagePath } = body;

    if (!imageUrl || !imageId || !storagePath) {
      return NextResponse.json(
        { error: "imageUrl, imageId, storagePath are required" },
        { status: 400 }
      );
    }

    // WebP変換・アップロード（リトライ機能付き）
    const { thumbPath, displayPath } = await uploadWebPVariants(
      imageUrl,
      storagePath,
      3 // 最大3回リトライ
    );

    // データベースのstorage_path_displayとstorage_path_thumbを更新
    await updateWebPStoragePaths(imageId, thumbPath, displayPath);

    return NextResponse.json({
      success: true,
      thumbPath,
      displayPath,
    });
  } catch (error) {
    console.error("WebP generation error:", error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : "WebP生成に失敗しました",
        success: false 
      },
      { status: 500 }
    );
  }
}
