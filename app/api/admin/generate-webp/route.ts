import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadWebPVariants, updateWebPStoragePaths } from "@/features/generation/lib/webp-storage";

/**
 * 既存資産のWebP生成バッチ処理API
 * 既存のgenerated_imagesからWebPが未生成の画像を取得してWebP変換を実行
 * 
 * クエリパラメータ:
 * - limit: 1回あたりの処理件数（デフォルト: 10）
 * - offset: オフセット（デフォルト: 0）
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient();

    // クエリパラメータを取得
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // WebPが未生成の画像を取得（storage_path_displayまたはstorage_path_thumbがNULL）
    const { data: images, error: fetchError } = await supabase
      .from("generated_images")
      .select("id, image_url, storage_path, storage_path_display, storage_path_thumb")
      .or("storage_path_display.is.null,storage_path_thumb.is.null")
      .not("storage_path", "is", null) // storage_pathが存在するもののみ
      .not("image_url", "is", null) // image_urlが存在するもののみ
      .order("created_at", { ascending: true }) // 古いものから順に処理
      .range(offset, offset + limit - 1);

    if (fetchError) {
      console.error("画像取得エラー:", fetchError);
      return NextResponse.json(
        { error: `画像の取得に失敗しました: ${fetchError.message}` },
        { status: 500 }
      );
    }

    if (!images || images.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        total: 0,
        message: "処理対象の画像がありません",
      });
    }

    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [] as Array<{ id: string; error: string }>,
    };

    // 各画像に対してWebP生成を実行
    for (const image of images) {
      try {
        // 既にWebPが生成されている場合はスキップ
        if (image.storage_path_display && image.storage_path_thumb) {
          results.skipped++;
          continue;
        }

        // WebP変換・アップロード（リトライ機能付き）
        const { thumbPath, displayPath } = await uploadWebPVariants(
          image.image_url!,
          image.storage_path!,
          3 // 最大3回リトライ
        );

        // データベースのstorage_path_displayとstorage_path_thumbを更新
        await updateWebPStoragePaths(image.id, thumbPath, displayPath);

        results.success++;
      } catch (error) {
        results.failed++;
        const errorMessage = error instanceof Error ? error.message : "不明なエラー";
        results.errors.push({
          id: image.id,
          error: errorMessage,
        });
        console.error(`画像ID ${image.id} のWebP生成に失敗しました:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      processed: images.length,
      results: {
        success: results.success,
        failed: results.failed,
        skipped: results.skipped,
        errors: results.errors,
      },
      nextOffset: offset + images.length,
    });
  } catch (error) {
    console.error("バッチ処理エラー:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "バッチ処理に失敗しました",
        success: false,
      },
      { status: 500 }
    );
  }
}

/**
 * 処理対象の画像数を取得
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();

    // WebPが未生成の画像数を取得
    const { count, error } = await supabase
      .from("generated_images")
      .select("*", { count: "exact", head: true })
      .or("storage_path_display.is.null,storage_path_thumb.is.null")
      .not("storage_path", "is", null)
      .not("image_url", "is", null);

    if (error) {
      console.error("画像数取得エラー:", error);
      return NextResponse.json(
        { error: `画像数の取得に失敗しました: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      count: count || 0,
    });
  } catch (error) {
    console.error("画像数取得エラー:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "画像数の取得に失敗しました",
        success: false,
      },
      { status: 500 }
    );
  }
}
