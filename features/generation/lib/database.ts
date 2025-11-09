import { createClient } from "@/lib/supabase/client";

/**
 * generated_imagesテーブルへのデータベース操作
 */

export interface GeneratedImageRecord {
  id?: string;
  user_id: string | null;
  image_url: string;
  storage_path: string;
  prompt: string;
  background_change: boolean;
  is_posted: boolean;
  caption?: string | null;
  posted_at?: string | null;
  created_at?: string;
}

/**
 * 生成画像のメタデータをデータベースに保存
 */
export async function saveGeneratedImage(
  data: Omit<GeneratedImageRecord, "id" | "created_at">
): Promise<GeneratedImageRecord> {
  const supabase = createClient();

  const { data: record, error } = await supabase
    .from("generated_images")
    .insert([data])
    .select()
    .single();

  if (error) {
    console.error("Database insert error:", error);
    throw new Error(`画像メタデータの保存に失敗しました: ${error.message}`);
  }

  return record;
}

/**
 * 複数の生成画像のメタデータを一括保存
 */
export async function saveGeneratedImages(
  images: Array<Omit<GeneratedImageRecord, "id" | "created_at">>
): Promise<GeneratedImageRecord[]> {
  const supabase = createClient();

  const { data: records, error } = await supabase
    .from("generated_images")
    .insert(images)
    .select();

  if (error) {
    console.error("Database insert error:", error);
    throw new Error(`画像メタデータの保存に失敗しました: ${error.message}`);
  }

  return records;
}

/**
 * ユーザーの生成画像一覧を取得
 */
export async function getGeneratedImages(
  userId: string,
  limit = 50,
  offset = 0
): Promise<GeneratedImageRecord[]> {
  const supabase = createClient();

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
 * 生成画像を削除
 */
export async function deleteGeneratedImage(id: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from("generated_images")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Database delete error:", error);
    throw new Error(`画像の削除に失敗しました: ${error.message}`);
  }
}

/**
 * 投稿済み画像一覧を取得（公開フィード用）
 */
export async function getPostedImages(
  limit = 50,
  offset = 0
): Promise<GeneratedImageRecord[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("generated_images")
    .select("*")
    .eq("is_posted", true)
    .order("posted_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`投稿画像の取得に失敗しました: ${error.message}`);
  }

  return data || [];
}

/**
 * 画像を投稿
 */
export async function postImage(
  id: string,
  caption?: string
): Promise<GeneratedImageRecord> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("generated_images")
    .update({
      is_posted: true,
      caption: caption || null,
      posted_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Database update error:", error);
    throw new Error(`画像の投稿に失敗しました: ${error.message}`);
  }

  return data;
}

