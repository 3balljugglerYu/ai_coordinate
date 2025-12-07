import { createClient } from "@/lib/supabase/server";
import type { SourceImageStock } from "./database";

/**
 * サーバーサイドでストック画像一覧を取得
 * 作成日時順（created_at DESC）で並び替え（新しいものから）
 */
export async function getSourceImageStocksServer(
  userId: string,
  limit = 50,
  offset = 0
): Promise<SourceImageStock[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("source_image_stocks")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`ストック画像の取得に失敗しました: ${error.message}`);
  }

  return data || [];
}

