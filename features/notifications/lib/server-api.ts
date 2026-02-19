import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getPostThumbUrl } from "@/features/posts/lib/utils";
import type { Notification, NotificationsResponse } from "../types";

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

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (error) {
    console.error("Database query error:", error);
    return { notifications: [], nextCursor: null };
  }

  if (!data || data.length === 0) {
    return { notifications: [], nextCursor: null };
  }

  const hasNextPage = data.length > limit;
  const notifications = hasNextPage ? data.slice(0, limit) : data;

  let nextCursor: string | null = null;
  if (hasNextPage && notifications.length > 0) {
    const lastNotification = notifications[notifications.length - 1];
    const cursorString = `${lastNotification.created_at}|${lastNotification.id}`;
    nextCursor = Buffer.from(cursorString).toString("base64");
  }

  const actorIds = Array.from(
    new Set(notifications.map((n) => n.actor_id).filter(Boolean))
  );

  const actorMap: Record<
    string,
    { nickname: string | null; avatar_url: string | null }
  > = {};
  if (actorIds.length > 0) {
    const { data: actors, error: actorsError } = await supabase
      .from("profiles")
      .select("user_id, nickname, avatar_url")
      .in("user_id", actorIds);

    if (!actorsError && actors) {
      for (const actor of actors) {
        actorMap[actor.user_id] = {
          nickname: actor.nickname,
          avatar_url: actor.avatar_url,
        };
      }
    }
  }

  const postIds = notifications
    .filter((n) => n.entity_type === "post")
    .map((n) => n.entity_id);

  const postMap: Record<
    string,
    { image_url: string | null; caption: string | null }
  > = {};
  if (postIds.length > 0) {
    const { data: posts, error: postsError } = await supabase
      .from("generated_images")
      .select("id, image_url, storage_path, storage_path_thumb, caption")
      .in("id", postIds);

    if (!postsError && posts) {
      for (const post of posts) {
        postMap[post.id] = {
          image_url:
            getPostThumbUrl({
              storage_path_thumb: post.storage_path_thumb,
              storage_path: post.storage_path,
              image_url: post.image_url,
            }) || null,
          caption: post.caption,
        };
      }
    }
  }

  const notificationsWithDetails: Notification[] = notifications.map(
    (notification) => {
      const actor = actorMap[notification.actor_id];
      const post =
        notification.entity_type === "post"
          ? postMap[notification.entity_id]
          : null;
      return {
        ...notification,
        actor: actor
          ? {
              id: notification.actor_id,
              nickname: actor.nickname,
              avatar_url: actor.avatar_url,
            }
          : null,
        post: post || null,
      };
    }
  );

  return {
    notifications: notificationsWithDetails,
    nextCursor,
  };
}
