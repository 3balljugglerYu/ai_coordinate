import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { SourceImageStock, GeneratedImageRecord } from "./database";

/**
 * サーバーサイドでストック画像一覧を取得
 * 作成日時順（created_at DESC）で並び替え（新しいものから）
 * React Cacheでラップして、同一リクエスト内での重複取得を防止
 */
export const getSourceImageStocksServer = cache(async (
  userId: string,
  limit = 50,
  offset = 0
): Promise<SourceImageStock[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("source_image_stocks")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`ストック画像の取得に失敗しました: ${error.message}`);
  }

  return data || [];
});

/**
 * サーバーサイドでストック画像制限数を取得
 * React Cacheでラップして、同一リクエスト内での重複取得を防止
 */
export const getStockImageLimitServer = cache(async (userId: string): Promise<{
  limit: number;
  currentCount: number;
}> => {
  const supabase = await createClient();

  // 制限数を取得（RPC関数）
  const { data: limitData, error: limitError } = await supabase.rpc("get_stock_image_limit");

  if (limitError) {
    console.error("RPC error:", limitError);
    throw new Error(`ストック画像制限数の取得に失敗しました: ${limitError.message}`);
  }

  const limit = limitData || 3; // デフォルト値

  // 現在のストック画像数を取得（ユーザーIDでフィルタリング）
  const { count, error: countError } = await supabase
    .from("source_image_stocks")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (countError) {
    console.error("Database query error:", countError);
    throw new Error(`ストック画像数の取得に失敗しました: ${countError.message}`);
  }

  return {
    limit,
    currentCount: count || 0,
  };
});

/**
 * サーバーサイドで生成画像一覧を取得
 * generationType が指定された場合はそのタイプのみを取得し、
 * 指定されない場合は全てのタイプを取得する。
 * React Cacheでラップして、同一リクエスト内での重複取得を防止
 */
export const getGeneratedImagesServer = cache(async (
  userId: string,
  limit = 4,
  offset = 0,
  generationType?: "coordinate" | "specified_coordinate" | "full_body" | "chibi"
): Promise<GeneratedImageRecord[]> => {
  const supabase = await createClient();

  let query = supabase
    .from("generated_images")
    .select("*")
    .eq("user_id", userId);

  // generationType が指定された場合のみフィルタリング
  if (generationType) {
    query = query.eq("generation_type", generationType);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`画像の取得に失敗しました: ${error.message}`);
  }

  return data || [];
});

/**
 * サーバーサイドで画像を投稿
 */
export async function postImageServer(
  id: string,
  caption?: string
): Promise<GeneratedImageRecord> {
  const supabase = await createClient();

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

/**
 * サーバーサイドで投稿を取り消す（is_postedをfalseに戻す）
 * 投稿一覧からは削除されるが、マイページには残る
 * @param id 画像ID
 * @param userId 対象ユーザーID（IDOR対策: 本人の画像のみ更新可能）
 */
export async function unpostImageServer(
  id: string,
  userId: string
): Promise<GeneratedImageRecord> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("generated_images")
    .update({
      is_posted: false,
      caption: null,
      posted_at: null,
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) {
    console.error("Database update error:", error);
    throw new Error(`投稿の取り消しに失敗しました: ${error.message}`);
  }

  return data;
}

