import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

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
  try {
    const user = await requireAuth();
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Stock image ID is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // ストック画像情報を取得して所有者を確認し、storage_pathを取得
    const { data: stock, error: fetchError } = await supabase
      .from("source_image_stocks")
      .select("user_id, storage_path")
      .eq("id", id)
      .single();

    if (fetchError || !stock) {
      return NextResponse.json(
        { error: "ストック画像が見つかりません" },
        { status: 404 }
      );
    }

    // 本人のみ削除可能
    if (stock.user_id !== user.id) {
      return NextResponse.json(
        { error: "このストック画像を削除する権限がありません" },
        { status: 403 }
      );
    }

    // ストレージ上の画像ファイルを削除（Service Role Keyを使用）
    if (stock.storage_path) {
      // Service Role Keyを使用して削除（RLSポリシーをバイパス）
      if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.NEXT_PUBLIC_SUPABASE_URL) {
        console.error("Service role key or Supabase URL is missing for storage operation");
        return NextResponse.json(
          { error: "サーバー設定エラーにより画像を削除できませんでした。" },
          { status: 500 }
        );
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
          // 削除エラーはログに記録するが、データベース削除は続行
          console.error("Failed to delete stock image from storage:", {
            path: stock.storage_path,
            error: deleteError,
          });
        } else {
          console.log("Successfully deleted stock image from storage:", stock.storage_path);
        }
      } catch (storageError) {
        // ストレージ削除エラーはログに記録するが、データベース削除は続行
        console.error("Error while deleting stock image from storage:", storageError);
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
      return NextResponse.json(
        { error: `ストック画像の削除に失敗しました: ${dbError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Stock image delete API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "ストック画像の削除に失敗しました",
      },
      { status: 500 }
    );
  }
}

