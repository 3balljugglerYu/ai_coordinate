import { createClient } from "@/lib/supabase/server";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";

export interface CreditTransaction {
  id: string;
  amount: number;
  transaction_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/**
 * マイページ用のサーバーサイドAPI関数
 */

/**
 * ユーザーの生成画像一覧を取得（サーバーサイド）
 */
export async function getMyImagesServer(
  userId: string,
  limit = 50,
  offset = 0
): Promise<GeneratedImageRecord[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("generated_images")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`画像の取得に失敗しました: ${error.message}`);
  }

  return data || [];
}

/**
 * ユーザーのクレジット残高を取得（サーバーサイド）
 */
export async function getCreditBalanceServer(userId: string): Promise<number> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("user_credits")
    .select("balance")
    .eq("user_id", userId)
    .single();

  if (error) {
    console.error("Database query error:", error);
    return 0;
  }

  return data?.balance || 0;
}

/**
 * クレジット取引履歴を取得（サーバーサイド）
 */
export async function getCreditTransactionsServer(
  userId: string,
  limit = 10
): Promise<CreditTransaction[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("credit_transactions")
    .select("id, amount, transaction_type, metadata, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Credit transactions fetch error:", error);
    return [];
  }

  return data || [];
}

