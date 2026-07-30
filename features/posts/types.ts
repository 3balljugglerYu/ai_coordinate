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
  // プロンプトをフォロワーへ開示するか。未指定なら API 側で更新しない（後方互換）。
  // 派生投稿は DB trigger が常に private へ強制するため、指定しても効かない。
  prompt_visibility?: "public" | "private";
}

/**
 * プロンプト非公開投稿の参照カードに必要な値（REQ-013 / REQ-014）。
 *
 * ここに載るのは**閲覧者に依存しない**判定だけである。フォロー有無とブロックは
 * クライアントの follow-status と生成APIの再検証で扱う。閲覧者ごとに分岐する値を
 * ここへ入れると `use cache` の粒度と噛み合わない。
 *
 * 原作が内在的に利用できない（削除・投稿取消・公開停止・公開へ戻された・
 * secret 消失・作者のアカウント利用不可）ときは `isAvailable: false` とし、
 * **形状を変えずにサムネイルだけ落とす**。原因ごとに応答が変わると、そこから
 * 原作の状態を推測できてしまう（ADR-005）。
 */
export interface SourcePromptReference {
  /** 原作 root 投稿 ID。利用不可でも系譜として保持する（REQ-011）。 */
  postId: string;
  /** 内在的に利用可能か。false ならサムネイルを含めない。 */
  isAvailable: boolean;
  /** 原作者。原作が削除されていてもクレジットは出す（REQ-011）。 */
  authorId: string | null;
  authorNickname: string | null;
  authorAvatarUrl: string | null;
  /** 利用可能なときだけ入る原作のサムネイル URL。 */
  thumbnailUrl: string | null;
  /**
   * 原作画像の実寸。カードのアスペクト比をこれに合わせる。
   * lazy compute でまだ埋まっていない行があるため null を許し、
   * 描画側は既定比率へフォールバックする。
   */
  thumbnailWidth: number | null;
  thumbnailHeight: number | null;
  /**
   * 原作の生成元画像（Before）の URL。
   *
   * プロンプトが見えない閲覧者にとって、After 1枚だけでは「プロンプトの効果」と
   * 「元のうちの子の魅力」が区別できない。Before を並べることで、そのプロンプトが
   * 何を変えるのかが分かる。非公開プロンプトでは Before/After が仕様書の代わりになる。
   *
   * 原作者が「生成前の画像も表示する」を外している場合は null。設定を尊重する。
   * 永続化が済んでいない場合も null（他人のジョブ行へは踏み込まない）。
   *
   * Before の実寸は持たない。`generated_images.width / height` は After の値で、
   * Before（アップロード画像から作った WebP）の寸法は保存していない。取得には
   * 画像ヘッダーの HTTP フェッチが必要で、投稿詳細の描画経路に載せる価値はない。
   * 描画側は After の比率を両セルで共有し、`object-cover object-top` で顔を残す。
   */
  beforeThumbnailUrl: string | null;
  /** このプロンプトを使った人数（原作者自身は除外）。 */
  usageCount: number;
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
  // プロンプト非公開投稿・派生投稿の参照カード用（REQ-013）。
  // 詳細取得の経路だけで解決する。一覧はプロンプト欄を持たないため付けない。
  source_reference?: SourcePromptReference | null;
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

/** コンポーザーの引用チップに表示する引用先(返信する対象)。 */
export interface ReplyToTarget {
  commentId: string;
  nickname: string | null;
  avatarUrl: string | null;
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
