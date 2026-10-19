import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "@/lib/is-uuid";
import { getPostDisplayUrl } from "@/features/posts/lib/utils";
import type { PersonalNoticeDetailView } from "./personal-notice-types";

const CODE_PLACEHOLDER = "{受付番号}";

/** 受け取った日(運営は日本時間で送るので、日付は日本時間で出す) */
export function formatPersonalNoticeDate(value: string, locale: string) {
  return new Date(value).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Tokyo",
  });
}

type RecipientRow = {
  receipt_code: string | null;
  post_id: string | null;
  created_at: string;
  notice: { title: string; body_template: string } | null;
};

/**
 * 個人あてのお知らせの詳細。⭐中身は通知の行でなく、運営だけが書ける記録の表から読む。
 * 利用者は自分の通知の行をどの列でも書き換えられる(notifications の UPDATE ポリシー)ので、
 * 通知の題名・本文を出すと、偽の「運営からのお知らせ」を作れてしまう。
 * 呼び出し側は service_role のクライアントを渡し、userId はセッションから入れる。
 * 本人以外・取り消し済み(通知が消えて notification_id が NULL)・本人が消した通知は null(404)。
 * 計画書 docs/planning/personal-notices-implementation-plan.md PN-010 / PN-012
 */
export async function getPersonalNoticeDetailForUser(
  adminClient: SupabaseClient,
  params: { notificationId: string; userId: string; locale: string }
): Promise<PersonalNoticeDetailView | null> {
  if (!isUuid(params.notificationId)) {
    return null;
  }

  const { data, error } = await adminClient
    .from("personal_notice_recipients")
    .select(
      "receipt_code, post_id, created_at, notice:personal_notices(title, body_template)"
    )
    .eq("notification_id", params.notificationId)
    .eq("recipient_id", params.userId)
    .is("retracted_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }
  const row = data as RecipientRow | null;
  if (!row?.notice) {
    return null;
  }

  // 送ったときと同じ置き換え(send_personal_notice の replace と同じ)
  const body = row.receipt_code
    ? row.notice.body_template.split(CODE_PLACEHOLDER).join(row.receipt_code)
    : row.notice.body_template;

  return {
    id: params.notificationId,
    title: row.notice.title,
    body,
    receivedAtLabel: formatPersonalNoticeDate(row.created_at, params.locale),
    post: row.post_id
      ? await getAttachedPost(adminClient, row.post_id, params.userId)
      : null,
  };
}

/** 送ったあとに非公開・公開停止になった作品は出さない(送るときと同じ条件) */
async function getAttachedPost(
  adminClient: SupabaseClient,
  postId: string,
  userId: string
): Promise<PersonalNoticeDetailView["post"]> {
  const { data: post, error } = await adminClient
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
