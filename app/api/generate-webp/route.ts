import { NextRequest, NextResponse } from "next/server";
import { uploadWebPVariants, updateWebPStoragePaths } from "@/features/generation/lib/webp-storage";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getGenerationRouteCopy } from "@/features/generation/lib/route-copy";

/**
 * WebP生成API Route
 * 画像をWebP形式に変換してSupabase Storageにアップロード
 */
export async function POST(request: NextRequest) {
  const copy = getGenerationRouteCopy(getRouteLocale(request));

  try {
    const body = await request.json();
    const { imageUrl, imageId, storagePath } = body;

    if (!imageUrl || !imageId || !storagePath) {
      return jsonError(copy.webpMissingParams, "GENERATION_WEBP_PARAMS_REQUIRED", 400);
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
        error: copy.webpFailed,
        errorCode: "GENERATION_WEBP_FAILED",
        success: false
      },
      { status: 500 }
    );
  }
}
