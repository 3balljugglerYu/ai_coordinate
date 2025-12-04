import { createClient as createBrowserClient } from "@/lib/supabase/client";

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
  // Phase 1で追加されたカラム（optional）
  generation_type?: 'coordinate' | 'specified_coordinate' | 'full_body' | 'chibi' | null;
  input_images?: Record<string, unknown> | null;
  generation_metadata?: Record<string, unknown> | null;
  source_image_stock_id?: string | null;
}

/**
 * ストック画像の型定義
 */
export interface SourceImageStock {
  id: string;
  user_id: string;
  image_url: string;
  storage_path: string;
  name?: string | null;
  last_used_at?: string | null;
  usage_count: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

/**
 * 生成画像のメタデータをデータベースに保存
 */
export async function saveGeneratedImage(
  data: Omit<GeneratedImageRecord, "id" | "created_at">
): Promise<GeneratedImageRecord> {
  const supabase = createBrowserClient();

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
  const supabase = createBrowserClient();

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
  const supabase = createBrowserClient();

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
  const supabase = createBrowserClient();

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
 * 画像を投稿
 */
export async function postImage(
  id: string,
  caption?: string
): Promise<GeneratedImageRecord> {
  const supabase = createBrowserClient();

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
 * 投稿を取り消す（is_postedをfalseに戻す）
 * 投稿一覧からは削除されるが、マイページには残る
 */
export async function unpostImage(id: string): Promise<GeneratedImageRecord> {
  const supabase = createBrowserClient();

  const { data, error } = await supabase
    .from("generated_images")
    .update({
      is_posted: false,
      caption: null,
      posted_at: null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Database update error:", error);
    throw new Error(`投稿の取り消しに失敗しました: ${error.message}`);
  }

  return data;
}

/**
 * ===============================================
 * ストック画像のCRUD操作関数
 * ===============================================
 */

/**
 * ストック画像制限数超過エラー
 */
export class StockLimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StockLimitExceededError";
  }
}

/**
 * ストック画像の制限数を取得
 * RPC関数を呼び出して取得
 */
export async function getStockImageLimit(): Promise<number> {
  const supabase = createBrowserClient();

  const { data, error } = await supabase.rpc("get_stock_image_limit");

  if (error) {
    console.error("RPC error:", error);
    throw new Error(`ストック画像制限数の取得に失敗しました: ${error.message}`);
  }

  return data || 3; // デフォルト値
}

/**
 * 現在のストック画像数を取得
 */
export async function getCurrentStockImageCount(): Promise<number> {
  const supabase = createBrowserClient();

  const { count, error } = await supabase
    .from("source_image_stocks")
    .select("*", { count: "exact", head: true })
    .is("deleted_at", null);

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`ストック画像数の取得に失敗しました: ${error.message}`);
  }

  return count || 0;
}

/**
 * ストック画像を保存
 * トランザクション内で制限数チェックを行い、超過時はエラーを返す
 */
export async function saveSourceImageStock(
  data: Omit<SourceImageStock, "id" | "created_at" | "updated_at" | "usage_count" | "last_used_at">
): Promise<SourceImageStock> {
  const supabase = createBrowserClient();

  // 制限数を取得
  const limit = await getStockImageLimit();

  // 現在のストック画像数を取得
  const currentCount = await getCurrentStockImageCount();

  // 制限数チェック
  if (currentCount >= limit) {
    throw new StockLimitExceededError(
      `ストック画像の上限（${limit}枚）に達しています。不要なストックを削除するか、プランをアップグレードしてください。`
    );
  }

  // ストック画像を保存
  const { data: record, error } = await supabase
    .from("source_image_stocks")
    .insert([data])
    .select()
    .single();

  if (error) {
    console.error("Database insert error:", error);
    throw new Error(`ストック画像の保存に失敗しました: ${error.message}`);
  }

  return record;
}

/**
 * ストック画像一覧を取得
 * 使用順（last_used_at DESC NULLS LAST）で並び替え
 */
export async function getSourceImageStocks(
  limit = 50,
  offset = 0
): Promise<SourceImageStock[]> {
  const supabase = createBrowserClient();

  const { data, error } = await supabase
    .from("source_image_stocks")
    .select("*")
    .is("deleted_at", null)
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`ストック画像の取得に失敗しました: ${error.message}`);
  }

  return data || [];
}

/**
 * ストック画像を取得（ID指定）
 */
export async function getSourceImageStock(id: string): Promise<SourceImageStock | null> {
  const supabase = createBrowserClient();

  const { data, error } = await supabase
    .from("source_image_stocks")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // レコードが見つからない場合
      return null;
    }
    console.error("Database query error:", error);
    throw new Error(`ストック画像の取得に失敗しました: ${error.message}`);
  }

  return data;
}

/**
 * ストック画像を削除（論理削除）
 */
export async function deleteSourceImageStock(id: string): Promise<void> {
  const supabase = createBrowserClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("ログインが必要です");
  }

  // ストック画像情報を取得して所有者を確認
  const { data: stock, error: fetchError } = await supabase
    .from("source_image_stocks")
    .select("user_id")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (fetchError || !stock) {
    throw new Error("ストック画像が見つかりません");
  }

  if (stock.user_id !== user.id) {
    throw new Error("このストック画像を削除する権限がありません");
  }

  // 論理削除を実行
  const { error } = await supabase
    .from("source_image_stocks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("Database update error:", error);
    throw new Error(`ストック画像の削除に失敗しました: ${error.message}`);
  }
}

/**
 * ストック画像を更新
 */
export async function updateSourceImageStock(
  id: string,
  updates: Partial<Pick<SourceImageStock, "name">>
): Promise<SourceImageStock> {
  const supabase = createBrowserClient();

  const { data, error } = await supabase
    .from("source_image_stocks")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Database update error:", error);
    throw new Error(`ストック画像の更新に失敗しました: ${error.message}`);
  }

  return data;
}

/**
 * ストック画像IDから過去の生成画像一覧を取得
 * storage_path完全一致のみを同一元画像とみなす（v1仕様）
 */
export async function getGeneratedImagesBySourceImage(
  stockId: string | null,
  storagePath: string | null
): Promise<GeneratedImageRecord[]> {
  const supabase = createBrowserClient();

  let query = supabase
    .from("generated_images")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10); // 最新10件

  if (stockId) {
    // ストック画像IDがある場合: source_image_stock_idで検索
    query = query.eq("source_image_stock_id", stockId);
  } else if (storagePath) {
    // ストック画像IDがない場合: storage_pathで検索（完全一致、v1仕様）
    query = query.eq("storage_path", storagePath);
  } else {
    // どちらもない場合は空配列を返す
    return [];
  }

  const { data, error } = await query;

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`生成画像の取得に失敗しました: ${error.message}`);
  }

  return data || [];
}

/**
 * ストック画像の使用回数を取得
 * RPC関数を呼び出して取得
 */
export async function getStockImageUsageCount(stockId: string): Promise<number> {
  const supabase = createBrowserClient();

  const { data, error } = await supabase.rpc("get_stock_image_usage_count", {
    stock_id_param: stockId,
  });

  if (error) {
    console.error("RPC error:", error);
    throw new Error(`ストック画像の使用回数取得に失敗しました: ${error.message}`);
  }

  return data || 0;
}

