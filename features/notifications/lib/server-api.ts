import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getPostThumbUrl } from "@/features/posts/lib/utils";
import {
  isAnonymousActorNotificationType,
  isModerationNotificationType,
} from "../types";
import type { Notification, NotificationsResponse } from "../types";
import { shouldHideThumbnailForPolicy } from "@/constants/moderation-policy";

type NotificationRow = Omit<Notification, "actor" | "post">;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** get_notifications_page が返す 1 行(通知の列 + 結合した値) */
export type NotificationPageRow = NotificationRow & {
  resolved_image_id: string | null;
  actor: {
    user_id: string;
    nickname: string | null;
    avatar_url: string | null;
  } | null;
  post: {
    id: string;
    image_url: string | null;
    storage_path: string | null;
    storage_path_thumb: string | null;
    caption: string | null;
  } | null;
};

/**
 * RPC の 1 行を画面用の通知にする。DB は結合した生の値だけを返すので、
 * 表示の規則はここで決める(アプリの notification_repository.dart と同じ規則)。
 */
export function toNotification(row: NotificationPageRow): Notification {
  const { resolved_image_id: resolvedImageId, actor, post, ...notification } =
    row;
  // 匿名通知（moderation 系・利用数マイルストーン）は actor_id に recipient
  // 本人が入るため、プロフィールを付けると「自分が自分に通知した」ように見える。
  // (ADR-011 / B案 REQ-005)
  const showActor =
    !isAnonymousActorNotificationType(notification.type) && actor !== null;
  // 重大な安全カテゴリでは、削除対象画像を通知でも再表示しない (ADR-011)。
  const hidePost =
    isModerationNotificationType(notification.type) &&
    shouldHideThumbnailForPolicy(notification.data?.policy_code);

  return {
    ...notification,
    data:
      notification.entity_type === "comment" && resolvedImageId
        ? { ...notification.data, image_id: resolvedImageId }
        : notification.data,
    actor: showActor
      ? {
          id: notification.actor_id,
          nickname: actor.nickname,
          avatar_url: actor.avatar_url,
        }
      : null,
    post:
      post && !hidePost
        ? {
            image_url:
              getPostThumbUrl({
                storage_path_thumb: post.storage_path_thumb,
                storage_path: post.storage_path,
                image_url: post.image_url,
              }) || null,
            caption: post.caption,
          }
        : null,
  };
}

/** `created_at|id` の base64。読めないカーソルは無視して先頭から返す */
export function decodeNotificationCursor(
  cursor: string | null | undefined
): { createdAt: string; id: string } | null {
  if (!cursor) return null;
  try {
    const [createdAt, id] = Buffer.from(cursor, "base64").toString().split("|");
    if (!createdAt || !id || !UUID_PATTERN.test(id)) return null;
    if (Number.isNaN(Date.parse(createdAt))) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function encodeNotificationCursor(row: { created_at: string; id: string }) {
  return Buffer.from(`${row.created_at}|${row.id}`).toString("base64");
}

export type NotificationsPageResult =
  | { ok: true; notifications: Notification[]; nextCursor: string | null }
  | { ok: false; error: unknown };

/**
 * お知らせ 1 ページ分を、相手のプロフィールと投稿のサムネイルつきで 1 回で取る。
 * notificationId を渡すとその 1 件だけ(Realtime の新着用)。
 */
export async function fetchNotificationsPage(
  supabase: SupabaseClient,
  params: {
    userId: string;
    limit: number;
    cursor?: string | null;
    notificationId?: string | null;
  }
): Promise<NotificationsPageResult> {
  const cursor = decodeNotificationCursor(params.cursor);
  const { data, error } = await supabase.rpc("get_notifications_page", {
    p_user_id: params.userId,
    p_limit: params.limit,
    p_cursor_created_at: cursor?.createdAt ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_notification_id: params.notificationId ?? null,
  });
  if (error) {
    return { ok: false, error };
  }

  const rows = (Array.isArray(data) ? data : []) as NotificationPageRow[];
  // RPC は次のページの有無を見るため limit + 1 件返す
  const hasNextPage = rows.length > params.limit;
  const pageRows = hasNextPage ? rows.slice(0, params.limit) : rows;
  const last = pageRows[pageRows.length - 1];

  return {
    ok: true,
    notifications: pageRows.map(toNotification),
    nextCursor: hasNextPage && last ? encodeNotificationCursor(last) : null,
  };
}

/**
 * 通知一覧を取得（サーバーサイド）
 * @param supabaseOverride - use cache 用。指定時は cookies を使わない
 */
export async function getNotificationsServer(
  userId: string,
  limit = 20,
  supabaseOverride?: SupabaseClient
): Promise<NotificationsResponse> {
  const supabase = supabaseOverride ?? (await createClient());

  const result = await fetchNotificationsPage(supabase, { userId, limit });
  if (!result.ok) {
    console.error("Database query error:", result.error);
    return { notifications: [], nextCursor: null };
  }

  return {
    notifications: result.notifications,
    nextCursor: result.nextCursor,
  };
}
