import { createClient } from "@/lib/supabase/client";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";

/**
 * マイページ用のAPI関数
 */

/**
 * ユーザーの生成画像一覧を取得
 */
export async function getMyImages(
  limit = 50,
  offset = 0
): Promise<GeneratedImageRecord[]> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("ログインが必要です");
  }

  const { data, error } = await supabase
    .from("generated_images")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`画像の取得に失敗しました: ${error.message}`);
  }

  return data || [];
}

/**
 * 画像の詳細を取得
 */
export async function getImageDetail(imageId: string): Promise<GeneratedImageRecord> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("ログインが必要です");
  }

  const { data, error } = await supabase
    .from("generated_images")
    .select("*")
    .eq("id", imageId)
    .eq("user_id", user.id)
    .single();

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`画像の取得に失敗しました: ${error.message}`);
  }

  return data;
}

/**
 * ユーザーのクレジット残高を取得
 */
export async function getCreditBalance(): Promise<number> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return 0;
  }

  const { data, error } = await supabase
    .from("user_credits")
    .select("balance")
    .eq("user_id", user.id)
    .single();

  if (error) {
    console.error("Database query error:", error);
    return 0;
  }

  return data?.balance || 0;
}

export interface CreditTransaction {
  id: string;
  amount: number;
  transaction_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export async function getCreditTransactions(
  limit = 10
): Promise<CreditTransaction[]> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from("credit_transactions")
    .select("id, amount, transaction_type, metadata, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Credit transactions fetch error:", error);
    return [];
  }

  return data || [];
}

/**
 * 画像を削除
 */
export async function deleteMyImage(imageId: string): Promise<void> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("ログインが必要です");
  }

  // 画像情報を取得してStorageパスを確認
  const { data: image, error: fetchError } = await supabase
    .from("generated_images")
    .select("storage_path, user_id")
    .eq("id", imageId)
    .single();

  if (fetchError || !image) {
    throw new Error("画像が見つかりません");
  }

  if (image.user_id !== user.id) {
    throw new Error("この画像を削除する権限がありません");
  }

  // Storageから削除
  const { error: storageError } = await supabase.storage
    .from("generated-images")
    .remove([image.storage_path]);

  if (storageError) {
    console.error("Storage delete error:", storageError);
  }

  // データベースから削除
  const { error: deleteError } = await supabase
    .from("generated_images")
    .delete()
    .eq("id", imageId)
    .eq("user_id", user.id);

  if (deleteError) {
    throw new Error(`画像の削除に失敗しました: ${deleteError.message}`);
  }
}

