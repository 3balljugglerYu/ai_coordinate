import { createClient } from "@/lib/supabase/server";
import { getPostedImages } from "@/features/generation/lib/database";
import type { Post } from "../types";

/**
 * 投稿機能のサーバーサイドAPI関数
 */

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
 */
export async function getPost(id: string): Promise<Post | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("generated_images")
    .select("*")
    .eq("id", id)
    .eq("is_posted", true)
    .single();

  if (error || !data) {
    return null;
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

