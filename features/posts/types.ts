/**
 * 投稿機能の型定義
 */

import type { GeneratedImageRecord } from "@/features/generation/lib/database";

export interface PostImageRequest {
  id: string;
  caption?: string;
  // 投稿モーダル / 編集モーダルで「生成前の画像も表示する」を切り替える。
  // 未指定なら API 側で更新しない（後方互換）。
  show_before_image?: boolean;
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
  // 公開閲覧数(viewableインプレッション)。フラグON時に👁の表示元となる。
  // view_count(詳細到達)は内部分析用に併存(docs/planning/post-impressions-implementation-plan.md)
  impression_count?: number;
  moderation_status?: "visible" | "pending" | "removed";
  // 完走フィード投稿(オプトイン)の識別とタップ先解決用。
  // completion_id があれば「コンプリート」バッジ + 没入シェアページ(/m/<id>[/book])へ遷移。
  completion_id?: string | null;
  completion_view_mode?: "mount" | "book" | null;
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

/**
 * 引用リプライの引用先情報(表示用)。
 * 表示のたびにサーバー側で最新のプロフィールを解決して返す
 * (ニックネーム変更・アバター変更に追従する)。
 */
export interface ReplyQuoteRef {
  user_id: string | null;
  nickname: string | null;
  avatar_url: string | null;
  content_preview: string;
}

export interface ReplyComment extends CommentRecordBase, CommentProfile {
  parent_comment_id: string;
  /** 引用先の返信ID(引用リプライのみ)。引用先の物理削除で NULL 化される。 */
  reply_to_comment_id: string | null;
  /** 引用先が削除された印。true なら「削除されたコメント」フォールバック表示。 */
  reply_to_deleted: boolean;
  /** 引用先の表示情報。引用なし・引用先削除済みのときは null。 */
  reply_to: ReplyQuoteRef | null;
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
