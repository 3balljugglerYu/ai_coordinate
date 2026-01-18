import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
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

  // 環境変数からイベントユーザーIDを取得
  const EVENT_USER_ID = env.NEXT_PUBLIC_EVENT_USER_ID;

  if (!EVENT_USER_ID) {
    throw new Error("NEXT_PUBLIC_EVENT_USER_ID環境変数が設定されていません");
  }

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
