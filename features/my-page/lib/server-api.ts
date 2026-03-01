import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";

export interface PercoinTransaction {
  id: string;
  amount: number;
  transaction_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  /** 期間限定ペルコインの場合のみ */
  expire_at?: string | null;
}

export interface UserProfile {
  id: string;
  nickname: string | null;
  bio: string | null;
  avatar_url: string | null;
  email?: string;
}

export interface UserStats {
  generatedCount: number;
  /** 他ユーザーの場合、生成数はRLSで非公開のため false */
  generatedCountPublic: boolean;
  postedCount: number;
  likeCount: number; // Phase 4で実装予定、現時点は0
  viewCount: number; // Phase 6で実装予定、現時点は0
  followerCount: number; // Phase 5で実装予定、現時点は0
  followingCount: number; // Phase 5で実装予定、現時点は0
}

/**
 * マイページ用のサーバーサイドAPI関数
 */

/**
 * ユーザープロフィール情報を取得（サーバーサイド）
 * profilesテーブルから取得
 * React Cacheでラップして、同一リクエスト内での重複取得を防止
 * @param supabaseOverride - use cache 用。指定時は cookies を使わず、email は返さない
 */
export const getUserProfileServer = cache(async (
  userId: string,
  supabaseOverride?: SupabaseClient
): Promise<UserProfile> => {
  const supabase = supabaseOverride ?? (await createClient());

  // profilesテーブルからプロフィール情報を取得
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, nickname, bio, avatar_url")
    .eq("user_id", userId)
    .single();

  if (error || !profile) {
    // プロフィールが存在しない場合は、基本情報のみ返す
    return {
      id: userId,
      nickname: null,
      bio: null,
      avatar_url: null,
    };
  }

  // supabaseOverride 指定時（他ユーザー閲覧キャッシュ）は email を返さない
  if (supabaseOverride) {
    return {
      id: profile.id,
      nickname: profile.nickname,
      bio: profile.bio,
      avatar_url: profile.avatar_url,
    };
  }

  // 自分のプロフィールの場合は、emailも取得
  const { data: { user } } = await supabase.auth.getUser();
  const isOwnProfile = user?.id === userId;

  return {
    id: profile.id,
    nickname: profile.nickname,
    bio: profile.bio,
    avatar_url: profile.avatar_url,
    email: isOwnProfile ? user?.email : undefined,
  };
});

/**
 * ユーザーの統計情報を取得（サーバーサイド）
 * React Cacheでラップして、同一リクエスト内での重複取得を防止
 * @param supabaseOverride - use cache 用。指定時は cookies を使わず、generatedCount=0, generatedCountPublic=false
 * @param options.isOwnProfile - supabaseOverride 指定時のみ有効。自分のプロフィールの場合は true（マイページ用）
 */
export const getUserStatsServer = cache(async (
  userId: string,
  supabaseOverride?: SupabaseClient,
  options?: { isOwnProfile?: boolean }
): Promise<UserStats> => {
  const supabase = supabaseOverride ?? (await createClient());

  // 投稿数の集計（RLS: 他ユーザーは is_posted=true のみ閲覧可能）
  const { count: postedCount } = await supabase
    .from("generated_images")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_posted", true);

  // 生成画像数の集計
  // 自分のプロフィール: 全件カウント可能（RLS: user_id = auth.uid()）
  // 他ユーザー: RLS で is_posted=true のみ見えるため、生成数は投稿数と同じになる
  // → 自分の場合のみ全件取得、他人の場合は投稿数で代用（生成数は非公開）
  const isOwnProfile = supabaseOverride
    ? (options?.isOwnProfile === true)
    : (await supabase.auth.getUser()).data.user?.id === userId;

  let generatedCount: number;
  if (isOwnProfile) {
    const { count } = await supabase
      .from("generated_images")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    generatedCount = count ?? 0;
  } else {
    // 他ユーザー: 生成数はRLSで非公開（未投稿画像は参照不可）
    generatedCount = 0; // UIでは generatedCountPublic=false のとき "-" を表示
  }

  // いいね総数の集計（likesテーブルとgenerated_imagesテーブルをJOIN）
  // まず、ユーザーの投稿済み画像IDを取得
  const { data: postedImages } = await supabase
    .from("generated_images")
    .select("id")
    .eq("user_id", userId)
    .eq("is_posted", true);

  const postedImageIds = postedImages?.map((img) => img.id) || [];

  let likeCount = 0;
  if (postedImageIds.length > 0) {
    // 投稿済み画像に対するいいね数を集計
    // likesテーブルはimage_idカラムを使用（post_idではない）
    const { count } = await supabase
      .from("likes")
      .select("*", { count: "exact", head: true })
      .in("image_id", postedImageIds);
    likeCount = count || 0;
  }

  // ビュー総数の集計（generated_imagesテーブルのview_countを合計）
  const { data: postedImagesWithViews } = await supabase
    .from("generated_images")
    .select("view_count")
    .eq("user_id", userId)
    .eq("is_posted", true);

  const viewCount =
    postedImagesWithViews?.reduce(
      (sum, img) => sum + (img.view_count || 0),
      0
    ) || 0;

  // フォロー数・フォロワー数を1回のRPCコールで取得
  const { data: followCounts, error: followCountsError } = await supabase
    .rpc("get_follow_counts", { p_user_id: userId })
    .single<{ following_count: number; follower_count: number }>();

  const followingCount = followCounts?.following_count ?? 0;
  const followerCount = followCounts?.follower_count ?? 0;

  if (followCountsError) {
    console.error("Follow counts fetch error:", followCountsError);
    // エラーが発生した場合は0を返す（既にデフォルト値で設定済み）
  }

  return {
    generatedCount: generatedCount || 0,
    generatedCountPublic: isOwnProfile,
    postedCount: postedCount || 0,
    likeCount: likeCount || 0,
    viewCount: viewCount,
    followerCount: followerCount,
    followingCount: followingCount,
  };
});

/**
 * ユーザーの投稿済み画像一覧を取得（サーバーサイド）
 * 他ユーザーのプロフィール画面用（投稿済みのみ）
 * @param supabaseOverride - use cache 用。指定時は cookies を使わない
 */
export async function getUserPostsServer(
  userId: string,
  limit = 20,
  offset = 0,
  supabaseOverride?: SupabaseClient
): Promise<GeneratedImageRecord[]> {
  const supabase = supabaseOverride ?? (await createClient());

  const { data, error } = await supabase
    .from("generated_images")
    .select("*")
    .eq("user_id", userId)
    .eq("is_posted", true)
    .order("posted_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("User posts fetch error:", error);
    return [];
  }

  return data || [];
}

/**
 * ユーザーの生成画像一覧を取得（サーバーサイド）
 * @param filter - "all" | "posted" | "unposted"
 * React Cacheでラップして、同一リクエスト内での重複取得を防止
 */
export const getMyImagesServer = cache(async (
  userId: string,
  filter: "all" | "posted" | "unposted" = "all",
  limit = 50,
  offset = 0,
  supabaseOverride?: SupabaseClient
): Promise<GeneratedImageRecord[]> => {
  try {
    const supabase = supabaseOverride ?? (await createClient());

    let query = supabase
      .from("generated_images")
      .select("*")
      .eq("user_id", userId);

    if (filter === "posted") {
      query = query.eq("is_posted", true).order("posted_at", { ascending: false });
    } else if (filter === "unposted") {
      query = query.eq("is_posted", false).order("created_at", { ascending: false });
    } else {
      query = query.order("created_at", { ascending: false });
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) {
      console.error("[getMyImagesServer] Database query error:", error);
      console.error("[getMyImagesServer] Error details:", JSON.stringify(error, null, 2));
      console.error("[getMyImagesServer] Error message:", error.message);
      console.error("[getMyImagesServer] Error code:", error.code);
      console.error("[getMyImagesServer] Error hint:", error.hint);
      console.error("[getMyImagesServer] User ID:", userId);
      console.error("[getMyImagesServer] Filter:", filter);
      throw new Error(`画像の取得に失敗しました: ${error.message || "Unknown error"}`);
    }

    return data || [];
  } catch (err) {
    console.error("[getMyImagesServer] Unexpected error:", err);
    if (err instanceof Error) {
      console.error("[getMyImagesServer] Error stack:", err.stack);
      throw err;
    }
    throw new Error(`画像の取得に失敗しました: ${err instanceof Error ? err.message : "Unknown error"}`);
  }
});

/**
 * 画像詳細を取得（サーバーサイド）
 * @param supabaseOverride - use cache 用。指定時は cookies を使わない
 */
export async function getImageDetailServer(
  userId: string,
  imageId: string,
  supabaseOverride?: SupabaseClient
): Promise<GeneratedImageRecord | null> {
  const supabase = supabaseOverride ?? (await createClient());

  const { data, error } = await supabase
    .from("generated_images")
    .select("*")
    .eq("id", imageId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

/**
 * ユーザーのペルコイン残高を取得（サーバーサイド）
 * React Cacheでラップして、同一リクエスト内での重複取得を防止
 * @param supabaseOverride - use cache 用。指定時は cookies を使わない
 */
export const getPercoinBalanceServer = cache(async (
  userId: string,
  supabaseOverride?: SupabaseClient
): Promise<number> => {
  const supabase = supabaseOverride ?? (await createClient());

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
});

/**
 * ペルコイン取引履歴を取得（サーバーサイド）
 * RPC get_percoin_transactions_with_expiry を使用
 * @param filter - 'all' | 'regular' | 'period_limited' | 'usage'
 * @param supabaseOverride - use cache 用。指定時は cookies を使わない
 */
export const PERCOIN_TRANSACTIONS_PER_PAGE = 30;

export const getPercoinTransactionsServer = cache(async (
  userId: string,
  limit = PERCOIN_TRANSACTIONS_PER_PAGE,
  supabaseOverride?: SupabaseClient,
  filter: "all" | "regular" | "period_limited" | "usage" = "all",
  offset = 0
): Promise<PercoinTransaction[]> => {
  const supabase = supabaseOverride ?? (await createClient());

  const { data, error } = await supabase.rpc("get_percoin_transactions_with_expiry", {
    p_user_id: userId,
    p_filter: filter,
    p_sort: "created_at",
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    console.error("Percoin transactions fetch error:", error);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id ?? ""),
    amount: Number(row.amount ?? 0),
    transaction_type: String(row.transaction_type ?? ""),
    metadata: (row.metadata as Record<string, unknown>) ?? null,
    created_at: String(row.created_at ?? ""),
    expire_at: row.expire_at != null ? String(row.expire_at) : null,
  }));
});

/**
 * ペルコイン残高の内訳を取得（サーバーサイド）
 * total: 合計、regular: 購入分（無期限）、period_limited: 期間限定
 * React Cacheでラップして、同一リクエスト内での重複取得を防止
 */
export interface PercoinBalanceBreakdown {
  total: number;
  regular: number;
  period_limited: number;
}

export const getPercoinBalanceBreakdownServer = cache(async (
  userId: string,
  supabaseOverride?: SupabaseClient
): Promise<PercoinBalanceBreakdown> => {
  const supabase = supabaseOverride ?? (await createClient());

  const { data, error } = await supabase
    .rpc("get_percoin_balance_breakdown", { p_user_id: userId })
    .single();

  if (error || !data) {
    console.error("get_percoin_balance_breakdown error:", error);
    return { total: 0, regular: 0, period_limited: 0 };
  }

  const raw = data as { total?: number; regular?: number; period_limited?: number };
  return {
    total: Number(raw.total ?? 0),
    regular: Number(raw.regular ?? 0),
    period_limited: Number(raw.period_limited ?? 0),
  };
});

export interface FreePercoinBatchExpiring {
  id: string;
  user_id: string;
  remaining_amount: number;
  expire_at: string;
  source: string;
}

/**
 * 期限が近い無償ペルコイン一覧を取得（マイページ用、userId指定）
 * CachedPercoinPageContent で createAdminClient 利用時に p_user_id を渡す
 */
export const getFreePercoinBatchesExpiringServer = cache(async (
  userId: string,
  supabaseOverride?: SupabaseClient
): Promise<FreePercoinBatchExpiring[]> => {
  const supabase = supabaseOverride ?? (await createClient());

  const { data, error } = await supabase.rpc("get_free_percoin_batches_expiring", {
    p_user_id: userId,
  });

  if (error) {
    console.error("get_free_percoin_batches_expiring error:", error);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id ?? ""),
    user_id: String(row.user_id ?? ""),
    remaining_amount: Number(row.remaining_amount ?? 0),
    expire_at: String(row.expire_at ?? ""),
    source: String(row.source ?? ""),
  }));
});
