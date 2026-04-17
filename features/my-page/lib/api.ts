import { createClient } from "@/lib/supabase/client";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";
import {
  redactSensitivePrompt,
  redactSensitivePrompts,
} from "@/features/generation/lib/prompt-visibility";

interface MyPageApiMessages {
  loginRequired?: string;
  imageFetchFailed?: string;
  imageNotFound?: string;
  deleteImageForbidden?: string;
  deleteImageFailed?: string;
}

/**
 * マイページ用のAPI関数
 */

/**
 * ユーザーの生成画像一覧を取得
 */
export async function getMyImages(
  limit = 50,
  offset = 0,
  messages?: MyPageApiMessages
): Promise<GeneratedImageRecord[]> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error(messages?.loginRequired || "ログインが必要です");
  }

  const { data, error } = await supabase
    .from("generated_images")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Database query error:", error);
    throw new Error(
      `${messages?.imageFetchFailed || "画像の取得に失敗しました"}: ${error.message}`
    );
  }

  return redactSensitivePrompts(data || []);
}

/**
 * 画像の詳細を取得
 */
export async function getImageDetail(
  imageId: string,
  messages?: MyPageApiMessages
): Promise<GeneratedImageRecord> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error(messages?.loginRequired || "ログインが必要です");
  }

  const { data, error } = await supabase
    .from("generated_images")
    .select("*")
    .eq("id", imageId)
    .eq("user_id", user.id)
    .single();

  if (error) {
    console.error("Database query error:", error);
    throw new Error(
      `${messages?.imageFetchFailed || "画像の取得に失敗しました"}: ${error.message}`
    );
  }

  return redactSensitivePrompt(data);
}

/**
 * ユーザーのペルコイン残高を取得
 */
export async function getPercoinBalance(): Promise<number> {
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

export interface PercoinBalanceBreakdown {
  total: number;
  regular: number;
  paid: number;
  unlimited_bonus: number;
  period_limited: number;
}

export interface FreePercoinBatchExpiring {
  id: string;
  user_id: string;
  remaining_amount: number;
  expire_at: string;
  source: string;
}

async function getAuthenticatedUserId() {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw new Error(error.message);
  }

  if (!user) {
    throw new Error("Authentication session unavailable");
  }

  return { supabase, userId: user.id };
}

export async function getPercoinBalanceBreakdown(): Promise<PercoinBalanceBreakdown> {
  const { supabase, userId } = await getAuthenticatedUserId();

  const { data, error } = await supabase
    .rpc("get_percoin_balance_breakdown", { p_user_id: userId })
    .maybeSingle();

  if (error) {
    console.error("get_percoin_balance_breakdown error:", error.message, error.code, error.details);
    throw new Error(error.message);
  }

  const raw = data as {
    total?: number;
    regular?: number;
    paid?: number;
    unlimited_bonus?: number;
    period_limited?: number;
  } | null;
  return {
    total: Number(raw?.total ?? 0),
    regular: Number(raw?.regular ?? 0),
    paid: Number(raw?.paid ?? 0),
    unlimited_bonus: Number(raw?.unlimited_bonus ?? 0),
    period_limited: Number(raw?.period_limited ?? 0),
  };
}

export async function getFreePercoinBatchesExpiring(): Promise<FreePercoinBatchExpiring[]> {
  const { supabase, userId } = await getAuthenticatedUserId();

  const { data, error } = await supabase.rpc("get_free_percoin_batches_expiring", {
    p_user_id: userId,
  });

  if (error) {
    console.error("get_free_percoin_batches_expiring error:", error);
    throw new Error(error.message);
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id ?? ""),
    user_id: String(row.user_id ?? ""),
    remaining_amount: Number(row.remaining_amount ?? 0),
    expire_at: String(row.expire_at ?? ""),
    source: String(row.source ?? ""),
  }));
}

export interface PercoinTransaction {
  id: string;
  amount: number;
  transaction_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  /** 期間限定ペルコインの場合のみ */
  expire_at?: string | null;
}

export const PERCOIN_TRANSACTIONS_PER_PAGE = 30;

export type PercoinTransactionFilter = "all" | "regular" | "period_limited" | "usage";

export async function getPercoinTransactions(
  limit = PERCOIN_TRANSACTIONS_PER_PAGE,
  filter: PercoinTransactionFilter = "all",
  offset = 0
): Promise<PercoinTransaction[]> {
  const { supabase, userId } = await getAuthenticatedUserId();

  const { data, error } = await supabase.rpc("get_percoin_transactions_with_expiry", {
    p_user_id: userId,
    p_filter: filter,
    p_sort: "created_at",
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    console.error("Percoin transactions fetch error:", error.message, error.code, error.details);
    throw new Error(error.message);
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id ?? ""),
    amount: Number(row.amount ?? 0),
    transaction_type: String(row.transaction_type ?? ""),
    metadata: (row.metadata as Record<string, unknown>) ?? null,
    created_at: String(row.created_at ?? ""),
    expire_at: row.expire_at != null ? String(row.expire_at) : null,
  }));
}

export async function getPercoinTransactionsCount(
  filter: PercoinTransactionFilter = "all"
): Promise<number> {
  const { supabase, userId } = await getAuthenticatedUserId();

  const { data, error } = await supabase.rpc("get_percoin_transactions_count", {
    p_user_id: userId,
    p_filter: filter,
  });

  if (error) {
    console.error("get_percoin_transactions_count error:", error.message);
    throw new Error(error.message);
  }

  return Number(data ?? 0);
}

/**
 * 画像を削除
 */
export async function deleteMyImage(
  imageId: string,
  messages?: MyPageApiMessages
): Promise<void> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error(messages?.loginRequired || "ログインが必要です");
  }

  // 画像情報を取得してStorageパスを確認
  const { data: image, error: fetchError } = await supabase
    .from("generated_images")
    .select("storage_path, user_id")
    .eq("id", imageId)
    .single();

  if (fetchError || !image) {
    throw new Error(messages?.imageNotFound || "画像が見つかりません");
  }

  if (image.user_id !== user.id) {
    throw new Error(
      messages?.deleteImageForbidden || "この画像を削除する権限がありません"
    );
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
    throw new Error(
      `${messages?.deleteImageFailed || "画像の削除に失敗しました"}: ${deleteError.message}`
    );
  }
}
