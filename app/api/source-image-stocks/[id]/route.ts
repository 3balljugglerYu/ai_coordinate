import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getSourceImageRouteCopy } from "@/features/generation/lib/source-image-route-copy";

const STORAGE_BUCKET = "generated-images";

/**
 * ストック画像削除API（DELETE）
 * 本人のみ削除可能
 * データベースレコードとストレージ上の画像ファイルの両方を削除
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const copy = getSourceImageRouteCopy(getRouteLocale(request));

  try {
    const user = await getUser();
    if (!user) {
      return jsonError(copy.authRequired, "SOURCE_IMAGE_AUTH_REQUIRED", 401);
    }
    const { id } = await params;

    if (!id) {
      return jsonError(copy.stockIdRequired, "SOURCE_IMAGE_ID_REQUIRED", 400);
    }

    const supabase = await createClient();

    // ストック画像情報を取得して所有者を確認し、storage_pathを取得
    const { data: stock, error: fetchError } = await supabase
      .from("source_image_stocks")
      .select("user_id, storage_path")
      .eq("id", id)
      .single();

    if (fetchError || !stock) {
      return jsonError(copy.stockNotFound, "SOURCE_IMAGE_NOT_FOUND", 404);
    }

    // 本人のみ削除可能
    if (stock.user_id !== user.id) {
      return jsonError(copy.deleteForbidden, "SOURCE_IMAGE_DELETE_FORBIDDEN", 403);
    }

    // ストレージ上の画像ファイルを削除（Service Role Keyを使用）
    if (stock.storage_path) {
      // Service Role Keyを使用して削除（RLSポリシーをバイパス）
      if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.NEXT_PUBLIC_SUPABASE_URL) {
        console.error("Service role key or Supabase URL is missing for storage operation");
        return jsonError(copy.serverConfigError, "SOURCE_IMAGE_SERVER_CONFIG_ERROR", 500);
      }

      try {
        const storageClient = createSupabaseClient(
          env.NEXT_PUBLIC_SUPABASE_URL,
          env.SUPABASE_SERVICE_ROLE_KEY
        );

        const { error: deleteError } = await storageClient.storage
          .from(STORAGE_BUCKET)
          .remove([stock.storage_path]);

        if (deleteError) {
          // 削除エラーはログに記録し、処理を中断
          console.error("Failed to delete stock image from storage:", {
            path: stock.storage_path,
            error: deleteError,
          });
          return jsonError(copy.storageDeleteFailed, "SOURCE_IMAGE_STORAGE_DELETE_FAILED", 500);
        } else {
          console.log("Successfully deleted stock image from storage:", stock.storage_path);
        }
      } catch (storageError) {
        console.error("Error while deleting stock image from storage:", storageError);
        return jsonError(copy.storageDeleteFailed, "SOURCE_IMAGE_STORAGE_DELETE_FAILED", 500);
      }
    }

    // データベースから物理削除を実行
    const { error: dbError } = await supabase
      .from("source_image_stocks")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (dbError) {
      console.error("Database delete error:", dbError);
      return jsonError(copy.deleteFailed, "SOURCE_IMAGE_DELETE_FAILED", 500);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Stock image delete API error:", error);
    return jsonError(copy.deleteFailed, "SOURCE_IMAGE_DELETE_FAILED", 500);
  }
}
