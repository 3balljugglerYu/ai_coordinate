import { createClient } from "@/lib/supabase/server";
import type { Post } from "../types";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";

/**
 * 投稿機能のサーバーサイドAPI関数
 */

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
 */
export async function getPosts(
  limit = 20,
  offset = 0
): Promise<Post[]> {
  const posts = await getPostedImages(limit, offset);

  // 投稿データにユーザー情報を結合
  // Phase 5でプロフィール機能実装時にユーザー情報を詳細化予定
  return posts.map((post) => ({
    ...post,
    user: post.user_id
      ? {
          id: post.user_id,
          email: undefined, // Phase 5で実装予定
          avatar_url: null, // Phase 5で実装予定
        }
      : null,
    like_count: 0, // Phase 4で実装予定
  }));
}

/**
 * 投稿詳細を取得（サーバーサイド）
 * 投稿済み画像は全ユーザーが閲覧可能、未投稿画像は所有者のみ閲覧可能
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

  return {
    ...data,
    user: data.user_id
      ? {
          id: data.user_id,
          email: undefined, // Phase 5で実装予定
          avatar_url: null, // Phase 5で実装予定
        }
      : null,
    like_count: 0, // Phase 4で実装予定
  };
}

