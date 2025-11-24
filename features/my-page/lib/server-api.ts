import { createClient } from "@/lib/supabase/server";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";

export interface CreditTransaction {
  id: string;
  amount: number;
  transaction_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
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
 */
export async function getUserProfileServer(userId: string): Promise<UserProfile> {
  const supabase = await createClient();

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
}

/**
 * ユーザーの統計情報を取得（サーバーサイド）
 */
export async function getUserStatsServer(userId: string): Promise<UserStats> {
  const supabase = await createClient();

  // 生成画像数の集計
  const { count: generatedCount } = await supabase
    .from("generated_images")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  // 投稿数の集計
  const { count: postedCount } = await supabase
    .from("generated_images")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_posted", true);

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
    const { count } = await supabase
      .from("likes")
      .select("*", { count: "exact", head: true })
      .in("post_id", postedImageIds);
    likeCount = count || 0;
  }

  // Phase 5で実装予定: フォロー数・フォロワー数
  // Phase 6で実装予定: 閲覧数

  return {
    generatedCount: generatedCount || 0,
    postedCount: postedCount || 0,
    likeCount: likeCount || 0,
    viewCount: 0, // Phase 6で実装予定
    followerCount: 0, // Phase 5で実装予定
    followingCount: 0, // Phase 5で実装予定
  };
}

/**
 * ユーザーの投稿済み画像一覧を取得（サーバーサイド）
 * 他ユーザーのプロフィール画面用（投稿済みのみ）
 */
export async function getUserPostsServer(
  userId: string,
  limit = 20,
  offset = 0
): Promise<GeneratedImageRecord[]> {
  const supabase = await createClient();

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
 */
export async function getMyImagesServer(
  userId: string,
  filter: "all" | "posted" | "unposted" = "all",
  limit = 50,
  offset = 0
): Promise<GeneratedImageRecord[]> {
  try {
    const supabase = await createClient();

    let query = supabase
      .from("generated_images")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (filter === "posted") {
      query = query.eq("is_posted", true);
    } else if (filter === "unposted") {
      query = query.eq("is_posted", false);
    }

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
