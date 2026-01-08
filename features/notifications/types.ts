/**
 * 通知機能の型定義
 */

export type NotificationType = 'like' | 'comment' | 'follow' | 'bonus';
export type EntityType = 'post' | 'comment' | 'user';

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
    follower_id?: string;
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

