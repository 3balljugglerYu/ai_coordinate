import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadWebPVariants, updateWebPStoragePaths } from "@/features/generation/lib/webp-storage";

/**
 * 特定の画像IDを指定してWebP生成を実行するAPI
 * バッチ処理で処理できなかった画像を個別に処理するために使用
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageId } = body;

    if (!imageId) {
      return NextResponse.json(
        { error: "imageId is required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // 画像情報を取得
    const { data: image, error: fetchError } = await supabase
      .from("generated_images")
      .select("id, image_url, storage_path, storage_path_display, storage_path_thumb")
      .eq("id", imageId)
      .single();

    if (fetchError || !image) {
      return NextResponse.json(
        { error: `画像の取得に失敗しました: ${fetchError?.message || "画像が見つかりません"}` },
        { status: 404 }
      );
    }

    // 既にWebPが生成されている場合はスキップ
    if (image.storage_path_display && image.storage_path_thumb) {
      return NextResponse.json({
        success: true,
        message: "既にWebPが生成されています",
        skipped: true,
      });
    }

    if (!image.image_url || !image.storage_path) {
      return NextResponse.json(
        { error: "画像URLまたはストレージパスが存在しません" },
        { status: 400 }
      );
    }

    // WebP変換・アップロード（リトライ機能付き）
    const { thumbPath, displayPath } = await uploadWebPVariants(
      image.image_url,
      image.storage_path,
      3 // 最大3回リトライ
    );

    // データベースのstorage_path_displayとstorage_path_thumbを更新
    await updateWebPStoragePaths(image.id, thumbPath, displayPath);

    return NextResponse.json({
      success: true,
      imageId: image.id,
      thumbPath,
      displayPath,
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
