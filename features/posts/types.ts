/**
 * 投稿機能の型定義
 */

import type { GeneratedImageRecord } from "@/features/generation/lib/database";

export interface PostImageRequest {
  id: string;
  caption?: string;
}

export interface PostImageResponse {
  id: string;
  is_posted: boolean;
  caption: string | null;
  posted_at: string;
  bonus_granted?: number; // デイリー投稿特典で付与されたペルコイン数（0: 未付与、50: 付与成功）
  bonus_multiplier?: number;
  subscription_plan?: "free" | "light" | "standard" | "premium";
}

export interface Post extends GeneratedImageRecord {
  user?: {
    id: string;
    email?: string;
    nickname?: string | null;
    avatar_url?: string | null;
    subscription_plan?: "free" | "light" | "standard" | "premium";
  } | null;
  like_count?: number;
  comment_count?: number;
  view_count?: number;
  moderation_status?: "visible" | "pending" | "removed";
  // Before 画像の楽観表示用フォールバック。
  // pre_generation_storage_path が無い間（生成完了直後の永続化処理中など）に
  // image_jobs.input_image_url で代替表示する。永続化完了後は null になる。
  input_image_url_fallback?: string | null;
}

export interface CommentProfile {
  user_nickname: string | null;
  user_avatar_url: string | null;
}

export interface CommentRecordBase {
  id: string;
  user_id: string | null;
  image_id: string;
  parent_comment_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ParentComment extends CommentRecordBase, CommentProfile {
  parent_comment_id: null;
  reply_count: number;
  last_activity_at: string;
}

export interface ReplyComment extends CommentRecordBase, CommentProfile {
  parent_comment_id: string;
}

export type CommentDeleteMode = "physical" | "logical";

export interface CommentDeleteResult {
  comment_id: string;
  image_id: string;
  parent_comment_id: string | null;
  deleted: CommentDeleteMode;
}

/**
 * 投稿のソートタイプ
 */
export type SortType = "newest" | "following" | "daily" | "week" | "month" | "popular";
