import { createClient } from "@/lib/supabase/server";
import type { Post } from "../types";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";
import {
  getJSTStartOfDay,
  getJSTEndOfDay,
  getJSTYesterdayStart,
  getJSTYesterdayEnd,
  getJSTLastWeekStart,
  getJSTLastWeekEnd,
  getJSTLastMonthStart,
  getJSTLastMonthEnd,
} from "./date-utils";

/**
 * 投稿機能のサーバーサイドAPI関数
 */

export type LikeRange = "all" | "day" | "week" | "month";

/**
 * 投稿済み画像一覧を取得（サーバーサイド専用）
 */
async function getPostedImages(
  limit = 50,
  offset = 0
): Promise<GeneratedImageRecord[]> {
  const supabase = await createClient();

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
 * 投稿一覧を取得（サーバーサイド）
 * SQL JOIN/サブクエリでいいね数・コメント数を一括取得（N+1問題を回避）
 */
export async function getPosts(
  limit = 20,
  offset = 0,
  sort: "newest" | "daily" | "week" | "month" = "newest"
): Promise<Post[]> {
  const supabase = await createClient();

  // 投稿一覧を取得するクエリを構築
  let postsQuery = supabase
    .from("generated_images")
    .select("*")
    .eq("is_posted", true);

  // 期間別ソートの場合は、その期間に投稿されたもののみをフィルタリング
  // posted_atがnullのレコードを除外
  if (sort === "daily") {
    // Daily: 昨日に投稿されたもののみ
    const jstYesterdayStart = getJSTYesterdayStart();
    const jstYesterdayEnd = getJSTYesterdayEnd();
    postsQuery = postsQuery
      .not("posted_at", "is", null)
      .gte("posted_at", jstYesterdayStart.toISOString())
      .lte("posted_at", jstYesterdayEnd.toISOString());
  } else if (sort === "week") {
    // Week: 先週に投稿されたもののみ
    const jstLastWeekStart = getJSTLastWeekStart();
    const jstLastWeekEnd = getJSTLastWeekEnd();
    postsQuery = postsQuery
      .not("posted_at", "is", null)
      .gte("posted_at", jstLastWeekStart.toISOString())
      .lte("posted_at", jstLastWeekEnd.toISOString());
  } else if (sort === "month") {
    // Month: 先月に投稿されたもののみ
    const jstLastMonthStart = getJSTLastMonthStart();
    const jstLastMonthEnd = getJSTLastMonthEnd();
    postsQuery = postsQuery
      .not("posted_at", "is", null)
      .gte("posted_at", jstLastMonthStart.toISOString())
      .lte("posted_at", jstLastMonthEnd.toISOString());
  }

  // 新着順で取得（期間別ソートの場合は、その期間内で新着順）
  postsQuery = postsQuery.order("posted_at", { ascending: false }).limit(1000);

  const { data: postsData, error: postsError } = await postsQuery;

  if (postsError) {
    console.error("Database query error:", postsError);
    throw new Error(`投稿画像の取得に失敗しました: ${postsError.message}`);
  }

  if (!postsData || postsData.length === 0) {
    return [];
  }

  // 投稿IDのリストを取得
  const postIds = postsData.map((post) => post.id);

  // いいね数・コメント数を一括取得（バッチ取得）
  const [likeCounts, commentCounts] = await Promise.all([
    getLikeCountsBatch(postIds),
    getCommentCountsBatch(postIds),
  ]);

  // 期間別のいいね数を取得（daily/week/monthの場合）
  // N+1問題を解消するため、バッチ処理で一括取得
  let rangeLikeCounts: Record<string, number> = {};
  if (sort !== "newest") {
    // sort型をLikeRange型にマッピング
    const rangeMap: Record<"daily" | "week" | "month", LikeRange> = {
      daily: "day",
      week: "week",
      month: "month",
    };
    const likeRange = rangeMap[sort as "daily" | "week" | "month"];
    
    // バッチ処理で一括取得（N+1問題の解消）
    rangeLikeCounts = await getLikeCountsByRangeBatch(postIds, likeRange);
  }

  // 投稿データにユーザー情報・いいね数・コメント数を結合
  let postsWithCounts = postsData.map((post) => ({
    ...post,
    user: post.user_id
      ? {
          id: post.user_id,
          email: undefined, // Phase 5で実装予定
          avatar_url: null, // Phase 5で実装予定
        }
      : null,
    like_count: likeCounts[post.id] || 0,
    comment_count: commentCounts[post.id] || 0,
    view_count: post.view_count || 0,
    range_like_count: sort !== "newest" ? rangeLikeCounts[post.id] || 0 : 0,
  }));

  // ソート条件に応じてソート
  if (sort === "newest") {
    // 新着順は既にソート済み
  } else {
    // daily/week/monthの場合は、期間別いいね数でソート
    // いいね数0の投稿を除外
    postsWithCounts = postsWithCounts.filter((post) => (post.range_like_count || 0) > 0);
    
    // 期間別いいね数でソート（降順）
    postsWithCounts.sort((a, b) => {
      const aCount = a.range_like_count || 0;
      const bCount = b.range_like_count || 0;
      if (bCount !== aCount) {
        return bCount - aCount; // 降順
      }
      // いいね数が同じ場合は、投稿日時でソート（降順）
      return new Date(b.posted_at || b.created_at).getTime() - new Date(a.posted_at || a.created_at).getTime();
    });
  }

  // ページネーション適用
  const paginatedPosts = postsWithCounts.slice(offset, offset + limit);

  return paginatedPosts.map((post) => ({
    ...post,
    range_like_count: undefined, // レスポンスから除外
  }));
}

/**
 * 投稿詳細を取得（サーバーサイド）
 * 投稿済み画像は全ユーザーが閲覧可能、未投稿画像は所有者のみ閲覧可能
 * いいね数・コメント数・閲覧数を取得し、閲覧数をインクリメント
 */
export async function getPost(id: string, currentUserId?: string | null): Promise<Post | null> {
  const supabase = await createClient();

  // まず画像を取得（is_postedの条件なし）
  const { data, error } = await supabase
    .from("generated_images")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return null;
  }

  // 投稿済みの場合は全ユーザーが閲覧可能
  // 未投稿の場合は所有者のみ閲覧可能
  if (!data.is_posted) {
    if (!currentUserId || data.user_id !== currentUserId) {
      // 未投稿画像で、所有者でない場合は404
      return null;
    }
  }

  // いいね数・コメント数を取得
  const [likeCount, commentCount] = await Promise.all([
    getLikeCount(id),
    getCommentCount(id),
  ]);

  // 閲覧数をインクリメント（重複カウント）
  await incrementViewCount(id);

  // 更新後の閲覧数を取得
  const { data: updatedData } = await supabase
    .from("generated_images")
    .select("view_count")
    .eq("id", id)
    .single();

  return {
    ...data,
    user: data.user_id
      ? {
          id: data.user_id,
          email: undefined, // Phase 5で実装予定
          avatar_url: null, // Phase 5で実装予定
        }
      : null,
    like_count: likeCount,
    comment_count: commentCount,
    view_count: updatedData?.view_count || data.view_count || 0,
  };
}

/**
 * いいね数を取得（単一）
 */
export async function getLikeCount(imageId: string): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("likes")
    .select("*", { count: "exact", head: true })
    .eq("image_id", imageId);

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`いいね数の取得に失敗しました: ${error.message}`);
  }

  return count || 0;
}

/**
 * いいね数を一括取得（バッチ、最大100件）
 */
export async function getLikeCountsBatch(imageIds: string[]): Promise<Record<string, number>> {
  if (imageIds.length === 0) {
    return {};
  }

  if (imageIds.length > 100) {
    throw new Error("バッチサイズは100件までです");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("likes")
    .select("image_id")
    .in("image_id", imageIds);

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`いいね数の一括取得に失敗しました: ${error.message}`);
  }

  // 集計
  const counts: Record<string, number> = {};
  imageIds.forEach((id) => {
    counts[id] = 0;
  });

  data?.forEach((like) => {
    if (like.image_id) {
      counts[like.image_id] = (counts[like.image_id] || 0) + 1;
    }
  });

  return counts;
}

/**
 * ユーザーのいいね状態を取得
 */
export async function getUserLikeStatus(imageId: string, userId: string): Promise<boolean> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("likes")
    .select("id")
    .eq("image_id", imageId)
    .eq("user_id", userId)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116は「レコードが見つからない」エラー（正常）
    console.error("Database query error:", error);
    throw new Error(`いいね状態の取得に失敗しました: ${error.message}`);
  }

  return !!data;
}

/**
 * ユーザーのいいね状態を一括取得（バッチ）
 */
export async function getUserLikeStatusesBatch(
  imageIds: string[],
  userId: string
): Promise<Record<string, boolean>> {
  if (imageIds.length === 0) {
    return {};
  }

  if (imageIds.length > 100) {
    throw new Error("バッチサイズは100件までです");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("likes")
    .select("image_id")
    .in("image_id", imageIds)
    .eq("user_id", userId);

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`いいね状態の一括取得に失敗しました: ${error.message}`);
  }

  const statuses: Record<string, boolean> = {};
  imageIds.forEach((id) => {
    statuses[id] = false;
  });

  data?.forEach((like) => {
    if (like.image_id) {
      statuses[like.image_id] = true;
    }
  });

  return statuses;
}

/**
 * いいねの追加・削除（トグル）
 */
export async function toggleLike(imageId: string, userId: string): Promise<boolean> {
  const supabase = await createClient();

  // 既存のいいねを確認
  const existing = await getUserLikeStatus(imageId, userId);

  if (existing) {
    // いいねを削除
    const { error } = await supabase
      .from("likes")
      .delete()
      .eq("image_id", imageId)
      .eq("user_id", userId);

    if (error) {
      console.error("Database query error:", error);
      throw new Error(`いいねの削除に失敗しました: ${error.message}`);
    }

    return false;
  } else {
    // いいねを追加
    const { error } = await supabase.from("likes").insert({
      image_id: imageId,
      user_id: userId,
    });

    if (error) {
      console.error("Database query error:", error);
      throw new Error(`いいねの追加に失敗しました: ${error.message}`);
    }

    return true;
  }
}

/**
 * 複数の投稿IDに対して期間別いいね数を一括取得（バッチ処理）
 * N+1問題を解消するため、一度のクエリで複数投稿のいいね数を取得
 * @param imageIds 投稿IDの配列
 * @param range 集計期間（"day" | "week" | "month"）
 * @returns 投稿IDをキー、いいね数を値とするオブジェクト
 */
export async function getLikeCountsByRangeBatch(
  imageIds: string[],
  range: LikeRange
): Promise<Record<string, number>> {
  if (imageIds.length === 0) {
    return {};
  }

  const supabase = await createClient();

  let query = supabase
    .from("likes")
    .select("image_id")
    .in("image_id", imageIds);

  // JST基準で期間フィルタリング（昨日/先週/先月）
  if (range === "day") {
    // Daily: 昨日のいいねのみ
    const jstYesterdayStart = getJSTYesterdayStart();
    const jstYesterdayEnd = getJSTYesterdayEnd();
    query = query
      .gte("created_at", jstYesterdayStart.toISOString())
      .lte("created_at", jstYesterdayEnd.toISOString());
  } else if (range === "week") {
    // Week: 先週のいいねのみ
    const jstLastWeekStart = getJSTLastWeekStart();
    const jstLastWeekEnd = getJSTLastWeekEnd();
    query = query
      .gte("created_at", jstLastWeekStart.toISOString())
      .lte("created_at", jstLastWeekEnd.toISOString());
  } else if (range === "month") {
    // Month: 先月のいいねのみ
    const jstLastMonthStart = getJSTLastMonthStart();
    const jstLastMonthEnd = getJSTLastMonthEnd();
    query = query
      .gte("created_at", jstLastMonthStart.toISOString())
      .lte("created_at", jstLastMonthEnd.toISOString());
  }
  // range === "all" の場合は期間制限なし

  const { data, error } = await query;

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`いいね数の一括集計に失敗しました: ${error.message}`);
  }

  // image_idごとに集計
  const counts: Record<string, number> = {};
  // 初期化：すべての投稿IDに対して0を設定
  imageIds.forEach((id) => {
    counts[id] = 0;
  });
  // いいねがある投稿のカウントを増やす
  data?.forEach((like) => {
    if (like.image_id) {
      counts[like.image_id] = (counts[like.image_id] || 0) + 1;
    }
  });

  return counts;
}

/**
 * いいね数を期間別に集計（単一投稿用）
 * 単一投稿の詳細画面などで使用される
 * @param imageId 投稿ID
 * @param range 集計期間（"all" | "day" | "week" | "month"）
 * @returns いいね数
 */
export async function getLikeCountInRange(
  imageId: string,
  range: LikeRange
): Promise<number> {
  const supabase = await createClient();

  let query = supabase.from("likes").select("*", { count: "exact", head: true }).eq("image_id", imageId);

  // JST基準で期間フィルタリング（昨日/先週/先月）
  if (range === "day") {
    // Daily: 昨日のいいねのみ
    const jstYesterdayStart = getJSTYesterdayStart();
    const jstYesterdayEnd = getJSTYesterdayEnd();
    query = query
      .gte("created_at", jstYesterdayStart.toISOString())
      .lte("created_at", jstYesterdayEnd.toISOString());
  } else if (range === "week") {
    // Week: 先週のいいねのみ
    const jstLastWeekStart = getJSTLastWeekStart();
    const jstLastWeekEnd = getJSTLastWeekEnd();
    query = query
      .gte("created_at", jstLastWeekStart.toISOString())
      .lte("created_at", jstLastWeekEnd.toISOString());
  } else if (range === "month") {
    // Month: 先月のいいねのみ
    const jstLastMonthStart = getJSTLastMonthStart();
    const jstLastMonthEnd = getJSTLastMonthEnd();
    query = query
      .gte("created_at", jstLastMonthStart.toISOString())
      .lte("created_at", jstLastMonthEnd.toISOString());
  }
  // range === "all" の場合は期間制限なし

  const { count, error } = await query;

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`いいね数の集計に失敗しました: ${error.message}`);
  }

  return count || 0;
}

/**
 * コメント数を取得（単一）
 */
export async function getCommentCount(imageId: string): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("comments")
    .select("*", { count: "exact", head: true })
    .eq("image_id", imageId)
    .is("deleted_at", null);

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`コメント数の取得に失敗しました: ${error.message}`);
  }

  return count || 0;
}

/**
 * コメント数を一括取得（バッチ、最大100件）
 */
export async function getCommentCountsBatch(imageIds: string[]): Promise<Record<string, number>> {
  if (imageIds.length === 0) {
    return {};
  }

  if (imageIds.length > 100) {
    throw new Error("バッチサイズは100件までです");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("comments")
    .select("image_id")
    .in("image_id", imageIds)
    .is("deleted_at", null);

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`コメント数の一括取得に失敗しました: ${error.message}`);
  }

  // 集計
  const counts: Record<string, number> = {};
  imageIds.forEach((id) => {
    counts[id] = 0;
  });

  data?.forEach((comment) => {
    if (comment.image_id) {
      counts[comment.image_id] = (counts[comment.image_id] || 0) + 1;
    }
  });

  return counts;
}

/**
 * コメント一覧を取得
 */
export async function getComments(
  imageId: string,
  limit: number,
  offset: number
): Promise<Array<{
  id: string;
  user_id: string;
  image_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("comments")
    .select("*")
    .eq("image_id", imageId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`コメントの取得に失敗しました: ${error.message}`);
  }

  return data || [];
}

/**
 * コメントを投稿
 */
export async function createComment(
  imageId: string,
  userId: string,
  content: string
): Promise<{
  id: string;
  user_id: string;
  image_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}> {
  // サーバー側バリデーション
  const trimmedContent = content.trim();
  if (trimmedContent.length === 0 || trimmedContent.length > 200) {
    throw new Error("コメントは1文字以上200文字以内で入力してください");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("comments")
    .insert({
      image_id: imageId,
      user_id: userId,
      content: trimmedContent,
    })
    .select()
    .single();

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`コメントの投稿に失敗しました: ${error.message}`);
  }

  return data;
}

/**
 * コメントを編集
 */
export async function updateComment(
  commentId: string,
  userId: string,
  content: string
): Promise<{
  id: string;
  user_id: string;
  image_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}> {
  // サーバー側バリデーション
  const trimmedContent = content.trim();
  if (trimmedContent.length === 0 || trimmedContent.length > 200) {
    throw new Error("コメントは1文字以上200文字以内で入力してください");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("comments")
    .update({
      content: trimmedContent,
      updated_at: new Date().toISOString(),
    })
    .eq("id", commentId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .select()
    .single();

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`コメントの編集に失敗しました: ${error.message}`);
  }

  if (!data) {
    throw new Error("コメントが見つかりません");
  }

  return data;
}

/**
 * コメントを削除（論理削除）
 */
export async function deleteComment(
  commentId: string,
  userId: string
): Promise<void> {
  const supabase = await createClient();

  // デバッグ: 認証状態を確認
  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();
  console.log("[deleteComment] Auth user:", authUser?.id);
  console.log("[deleteComment] Provided userId:", userId);
  console.log("[deleteComment] Auth error:", authError);

  // まずコメントが存在し、所有者であることを確認
  const { data: existingComment, error: checkError } = await supabase
    .from("comments")
    .select("id, user_id")
    .eq("id", commentId)
    .single();

  console.log("[deleteComment] Existing comment:", existingComment);
  console.log("[deleteComment] Check error:", checkError);

  if (checkError || !existingComment) {
    console.error("Comment check error:", checkError);
    throw new Error("コメントが見つかりません");
  }

  if (existingComment.user_id !== userId) {
    console.error(
      "[deleteComment] User ID mismatch:",
      existingComment.user_id,
      "!=",
      userId
    );
    throw new Error("コメントを削除する権限がありません");
  }

  // 認証ユーザーIDと一致するか確認
  if (authUser?.id !== userId) {
    console.error(
      "[deleteComment] Auth user ID mismatch:",
      authUser?.id,
      "!=",
      userId
    );
    throw new Error("認証ユーザーと一致しません");
  }

  console.log("[deleteComment] Attempting to delete comment:", commentId);

  // 物理削除を実行
  const { error } = await supabase
    .from("comments")
    .delete()
    .eq("id", commentId)
    .eq("user_id", userId);

  console.log("[deleteComment] Delete error:", error);

  if (error) {
    console.error("Database query error:", error);
    console.error("Error details:", JSON.stringify(error, null, 2));
    console.error("[deleteComment] Comment ID:", commentId);
    console.error("[deleteComment] User ID:", userId);
    console.error("[deleteComment] Auth User ID:", authUser?.id);
    throw new Error(`コメントの削除に失敗しました: ${error.message}`);
  }
}

/**
 * 閲覧数をインクリメント（重複カウント）
 */
export async function incrementViewCount(imageId: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("increment_view_count", {
    image_id_param: imageId,
  });

  if (error) {
    console.error("Database query error:", error);
    throw new Error(`閲覧数の更新に失敗しました: ${error.message}`);
  }
}

