import type { SupabaseClient } from "@supabase/supabase-js";
import { getPostDisplayUrl } from "@/features/posts/lib/utils";
import type { PersonalNoticeDetailView } from "../components/PersonalNoticeDetailScreen";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 受け取った日(運営は日本時間で送るので、日付は日本時間で出す) */
export function formatPersonalNoticeDate(value: string, locale: string) {
  return new Date(value).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Tokyo",
  });
}

/**
 * 個人あてのお知らせの詳細を、本人のセッションで読む(RLS で本人の通知だけ)。
 * 取り消すと通知の行が消えるので、行が無い = 本人以外・取り消し済み = null(404)。
 * 計画書 docs/planning/personal-notices-implementation-plan.md PN-010 / PN-012
 */
export async function getPersonalNoticeDetailForUser(
  supabase: SupabaseClient,
  params: { notificationId: string; userId: string; locale: string }
): Promise<PersonalNoticeDetailView | null> {
  if (!UUID_PATTERN.test(params.notificationId)) {
    return null;
  }

  const { data: notification, error } = await supabase
    .from("notifications")
    .select("id, title, body, data, created_at")
    .eq("id", params.notificationId)
    .eq("recipient_id", params.userId)
    .eq("type", "admin_message")
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!notification) {
    return null;
  }

  const postId =
    typeof notification.data?.post_id === "string"
      ? notification.data.post_id
      : null;

  return {
    id: notification.id,
    title: notification.title,
    body: notification.body,
    receivedAtLabel: formatPersonalNoticeDate(
      notification.created_at,
      params.locale
    ),
    post: postId
      ? await getAttachedPost(supabase, postId, params.userId)
      : null,
  };
}

/** 送ったあとに非公開・公開停止になった作品は出さない(送るときと同じ条件) */
async function getAttachedPost(
  supabase: SupabaseClient,
  postId: string,
  userId: string
): Promise<PersonalNoticeDetailView["post"]> {
  const { data: post, error } = await supabase
    .from("generated_images")
    .select("id, image_url, storage_path, storage_path_display")
    .eq("id", postId)
    .eq("user_id", userId)
    .eq("is_posted", true)
    .eq("moderation_status", "visible")
    .maybeSingle();

  if (error) {
    console.error("Failed to load personal notice post:", error);
    return null;
  }
  if (!post) {
    return null;
  }

  const imageUrl = getPostDisplayUrl(post);
  return imageUrl ? { id: post.id, imageUrl } : null;
}
