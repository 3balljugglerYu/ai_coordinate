import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { env } from "@/lib/env";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";
import { resolveOwnVisiblePrompts } from "@/features/generation/lib/prompt-secrets-client";

/**
 * イベント画像取得関数（クライアント側）
 * 特定ユーザーの投稿済みイラストを取得（無限スクロール用）
 */
export async function getEventImages(
  limit = 4,
  offset = 0
): Promise<GeneratedImageRecord[]> {
  const supabase = createBrowserClient();

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

  // プロンプトの正本は author secret。generated_images.prompt は
  // 移行期間の互換用にすぎず、Phase 0C で空になる（ADR-001）。
  return await resolveOwnVisiblePrompts(data || []);
}
