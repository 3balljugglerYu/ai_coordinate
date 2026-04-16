import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getPostThumbUrl } from "@/features/posts/lib/utils";
import type { Notification, NotificationsResponse } from "../types";

type NotificationRow = Omit<Notification, "actor" | "post">;

function getResolvedImageId(
  notification: NotificationRow,
  commentImageIdMap: Record<string, string>
) {
  if (notification.entity_type === "post") {
    return notification.entity_id;
  }

  if (
    notification.entity_type === "comment" &&
    typeof notification.data?.image_id === "string" &&
    notification.data.image_id.length > 0
  ) {
    return notification.data.image_id;
  }

  if (notification.entity_type === "comment") {
    return commentImageIdMap[notification.entity_id] ?? null;
  }

  return null;
}

export async function enrichNotificationsWithDetails(
  supabase: SupabaseClient,
  notifications: NotificationRow[]
): Promise<Notification[]> {
  const actorIds = Array.from(
    new Set(notifications.map((notification) => notification.actor_id).filter(Boolean))
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

  const unresolvedCommentEntityIds = notifications
    .filter(
      (notification) =>
        notification.entity_type === "comment" &&
        (!notification.data?.image_id ||
          typeof notification.data.image_id !== "string")
    )
    .map((notification) => notification.entity_id);

  const commentImageIdMap: Record<string, string> = {};
  if (unresolvedCommentEntityIds.length > 0) {
    const { data: commentRows, error: commentsError } = await supabase
      .from("comments")
      .select("id, image_id")
      .in("id", unresolvedCommentEntityIds);

    if (!commentsError && commentRows) {
      for (const comment of commentRows) {
        commentImageIdMap[comment.id] = comment.image_id;
      }
    }
  }

  const imageIds = Array.from(
    new Set(
      notifications
        .map((notification) => getResolvedImageId(notification, commentImageIdMap))
        .filter((imageId): imageId is string => Boolean(imageId))
    )
  );

  const postMap: Record<
    string,
    { image_url: string | null; caption: string | null }
  > = {};
  if (imageIds.length > 0) {
    const { data: posts, error: postsError } = await supabase
      .from("generated_images")
      .select("id, image_url, storage_path, storage_path_thumb, caption")
      .in("id", imageIds);

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

  return notifications.map((notification) => {
    const actor = actorMap[notification.actor_id];
    const resolvedImageId = getResolvedImageId(notification, commentImageIdMap);
    const post = resolvedImageId ? postMap[resolvedImageId] : null;

    return {
      ...notification,
      data:
        notification.entity_type === "comment" && resolvedImageId
          ? {
              ...notification.data,
              image_id: resolvedImageId,
            }
          : notification.data,
      actor: actor
        ? {
            id: notification.actor_id,
            nickname: actor.nickname,
            avatar_url: actor.avatar_url,
          }
        : null,
      post: post || null,
    };
  });
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
  const notificationsWithDetails = await enrichNotificationsWithDetails(
    supabase,
    notifications
  );

  return {
    notifications: notificationsWithDetails,
    nextCursor,
  };
}
