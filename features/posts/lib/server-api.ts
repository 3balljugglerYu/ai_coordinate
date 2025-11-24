import { createClient } from "@/lib/supabase/server";
import type { Post } from "../types";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";

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

  // まず投稿一覧を取得（新着順で取得）
  const { data: postsData, error: postsError } = await supabase
    .from("generated_images")
    .select("*")
    .eq("is_posted", true)
    .order("posted_at", { ascending: false })
    .limit(1000); // 期間別ソートのため、より多くの投稿を取得

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
  let rangeLikeCounts: Record<string, number> = {};
  if (sort !== "newest") {
    // sort型をLikeRange型にマッピング
    const rangeMap: Record<"daily" | "week" | "month", LikeRange> = {
      daily: "day",
      week: "week",
      month: "month",
    };
    const likeRange = rangeMap[sort as "daily" | "week" | "month"];
    
    const rangePromises = postIds.map(async (id) => {
      const count = await getLikeCountInRange(id, likeRange);
      return { id, count };
    });
    const rangeResults = await Promise.all(rangePromises);
    rangeLikeCounts = rangeResults.reduce(
      (acc, { id, count }) => {
        acc[id] = count;
        return acc;
      },
      {} as Record<string, number>
    );
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
    postsWithCounts.sort((a, b) => {
      const aCount = a.range_like_count || 0;
      const bCount = b.range_like_count || 0;
      if (bCount !== aCount) {
        return bCount - aCount; // 降順
      }
      // いいね数が同じ場合は、投稿日時でソート
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
 * いいね数を期間別に集計（共通関数）
 */
export async function getLikeCountInRange(
  imageId: string,
  range: LikeRange
): Promise<number> {
  const supabase = await createClient();

  let query = supabase.from("likes").select("*", { count: "exact", head: true }).eq("image_id", imageId);

  if (range === "day") {
    query = query.gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  } else if (range === "week") {
    query = query.gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
  } else if (range === "month") {
    query = query.gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
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

