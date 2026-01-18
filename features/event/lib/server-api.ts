import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";

/**
 * イベント画像取得関数（サーバー側）
 * 特定ユーザーの投稿済みイラストを取得
 * React.cache()でラップして、同一リクエスト内での重複取得を防止
 */
export const getEventImagesServer = cache(async (
  limit = 4,
  offset = 0
): Promise<GeneratedImageRecord[]> => {
  const supabase = await createClient();

  // 固定ユーザーID
  const EVENT_USER_ID = "dfe54c3c-3764-4758-89eb-2bd445fdc4c6";

  const { data, error } = await supabase
    .from("generated_images")
    .select("*")
    .eq("is_posted", true)
    .eq("user_id", EVENT_USER_ID)
    .order("posted_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`イベント画像の取得に失敗しました: ${error.message}`);
  }

  return data || [];
});
