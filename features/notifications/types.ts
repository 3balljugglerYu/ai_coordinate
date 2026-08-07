/**
 * 通知機能の型定義
 */

export type NotificationType =
  | 'like'
  | 'comment'
  | 'follow'
  | 'bonus'
  | 'post_moderation_removed'
  | 'post_moderation_appeal_result'
  | 'derived_post_published'
  | 'derived_usage_milestone'
  | 'style_preset_post_published'
  | 'style_preset_usage_milestone'
  | 'usage_reward_earned';
export type EntityType = 'post' | 'comment' | 'user';

/**
 * 運営の措置に関する通知タイプ。
 *
 * 設計判断: docs/planning/post-moderation-notification-implementation-plan.md ADR-011
 *
 * これらの通知は投稿者本人が recipient で、actor_id にも recipient 本人の ID が入る
 * (= 判定した管理者の個人情報を投稿者へ渡さないため)。したがって actor の
 * プロフィール enrichment を行ってはならない。UI は運営ロゴで表示する。
 */
export const MODERATION_NOTIFICATION_TYPES = [
  'post_moderation_removed',
  'post_moderation_appeal_result',
] as const;

export function isModerationNotificationType(type: string): boolean {
  return (MODERATION_NOTIFICATION_TYPES as readonly string[]).includes(type);
}

/**
 * actor が存在しない匿名通知タイプ（actor_id には recipient 本人が入る）。
 * moderation 系（ADR-011）・利用数マイルストーン（B案 REQ-005）・
 * クリエイター還元（REQ-005: 誰が利用したかは含めない）。
 *
 * これらは actor の enrichment を行わず、UI は運営ロゴで表示し、
 * アバターにプロフィール導線を付けてはならない。
 */
export const ANONYMOUS_ACTOR_NOTIFICATION_TYPES = [
  ...MODERATION_NOTIFICATION_TYPES,
  'derived_usage_milestone',
  'style_preset_usage_milestone',
  'usage_reward_earned',
] as const;

export function isAnonymousActorNotificationType(type: string): boolean {
  return (ANONYMOUS_ACTOR_NOTIFICATION_TYPES as readonly string[]).includes(
    type
  );
}

export interface Notification {
  id: string;
  recipient_id: string;
  actor_id: string;
  type: NotificationType;
  entity_type: EntityType;
  entity_id: string;
  title: string;
  body: string;
  data: {
    image_id?: string;
    image_url?: string;
    comment_id?: string;
    comment_content?: string;
    /** 返信種別。"reply_to_reply" は引用リプライ(あなたの返信への返信)。 */
    reply_kind?: "reply_to_reply";
    reply_to_comment_id?: string;
    parent_comment_id?: string;
    follower_id?: string;
    /** 派生投稿通知 (derived_post_published): 原作キャプションのスナップショット。見出しに差し込む。 */
    origin_caption?: string | null;
    /** 利用数マイルストーン通知 (derived_usage_milestone / style_preset_usage_milestone): 到達した節目の回数。 */
    milestone?: number;
    /**
     * クリエイター還元通知 (usage_reward_earned): その日(JST)の累計。
     * 受け手×日付で1行に集約し、付与のたびに加算される。
     */
    reward_date?: string;
    usage_count?: number;
    total_amount?: number;
    /** One-Tap Style クリエイター通知: 対象プリセットのID・名前・slug のスナップショット。 */
    preset_id?: string;
    preset_title?: string | null;
    preset_slug?: string | null;
    bonus_type?: "admin_bonus" | "daily_post" | "streak" | "referral" | "signup_bonus" | "tour_bonus";
    bonus_amount?: number;
    streak_days?: number;
    reason?: string;
    /**
     * モデレーション通知 (post_moderation_*) の payload。
     * outbox の payload をそのまま格納する。通報者情報・通報件数は含まない
     * (ADR-011 / REQ-022, REQ-023)。
     */
    moderation_decision_id?: string;
    policy_code?: string;
    policy_version?: string;
    policy_anchor?: string;
    author_facing_reason?: string;
    restriction_scope?: string;
    restriction_duration?: string;
    appeal_id?: string;
    appeal_status?: "pending" | "upheld" | "overturned";
    decision_note?: string;
    /** dispatcher の冪等キー。UI では使わない。 */
    moderation_event_key?: string;
    /** 運営発の通知であることの印。UI はこれを見て運営ロゴを出す。 */
    system_generated?: boolean;
  };
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  actor?: {
    id: string;
    nickname: string | null;
    avatar_url: string | null;
  } | null;
  post?: {
    image_url: string | null;
    caption: string | null;
  } | null;
}

export interface NotificationsResponse {
  notifications: Notification[];
  nextCursor: string | null;
}

export interface UnreadCountResponse {
  count: number;
}
