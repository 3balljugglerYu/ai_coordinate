import type { Notification } from "../types";

type TranslationValues = Record<string, string | number>;
export type NotificationTranslationKey =
  | "bonusAdminBody"
  | "bonusAdminTitle"
  | "bonusDailyPostBody"
  | "bonusDailyPostTitle"
  | "bonusReferralBody"
  | "bonusReferralTitle"
  | "bonusSignupBody"
  | "bonusSignupTitle"
  | "bonusStreakBody"
  | "bonusStreakTitle"
  | "bonusTourBody"
  | "bonusTourTitle"
  | "commentTitle"
  | "derivedPostTitle"
  | "derivedPostTitleNoCaption"
  | "followTitle"
  | "likeTitle"
  | "replyTitle"
  | "replyToReplyTitle"
  | "moderationRemovedTitle"
  | "moderationRemovedBody"
  | "moderationAppealUpheldTitle"
  | "moderationAppealOverturnedTitle"
  | "moderationAppealResultTitle";

function getStringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getNumberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

/**
 * 原作キャプションの見出し内表示は書記素クラスタ単位で20文字まで。
 * UTF-16 の slice だと絵文字のサロゲートペアや結合文字を途中で割ってしまう。
 * 実際に超過した場合のみ省略記号を付ける。
 */
const ORIGIN_CAPTION_MAX_GRAPHEMES = 20;

function truncateOriginCaption(caption: string): string {
  const graphemes =
    typeof Intl !== "undefined" && "Segmenter" in Intl
      ? Array.from(
          new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
            caption
          ),
          (entry) => entry.segment
        )
      : // Segmenter が無い環境ではコードポイント単位（結合文字の分割リスクは残るが落とさない）
        Array.from(caption);

  if (graphemes.length <= ORIGIN_CAPTION_MAX_GRAPHEMES) {
    return caption;
  }
  return graphemes.slice(0, ORIGIN_CAPTION_MAX_GRAPHEMES).join("") + "…";
}

function formatBonusNotification(
  notification: Notification,
  t: (key: NotificationTranslationKey, values?: TranslationValues) => string
) {
  const bonusType = getStringValue(notification.data?.bonus_type);
  const amount = getNumberValue(notification.data?.bonus_amount);
  const streakDays = getNumberValue(notification.data?.streak_days);

  switch (bonusType) {
    case "admin_bonus":
      return {
        title: getStringValue(notification.title) ?? t("bonusAdminTitle"),
        body:
          amount !== null
            ? t("bonusAdminBody", { amount })
            : notification.body,
      };
    case "daily_post":
      return {
        title: t("bonusDailyPostTitle"),
        body:
          amount !== null
            ? t("bonusDailyPostBody", { amount })
            : notification.body,
      };
    case "streak":
      return {
        title: t("bonusStreakTitle"),
        body:
          amount !== null && streakDays !== null
            ? t("bonusStreakBody", { amount, days: streakDays })
            : notification.body,
      };
    case "referral":
      return {
        title: t("bonusReferralTitle"),
        body:
          amount !== null
            ? t("bonusReferralBody", { amount })
            : notification.body,
      };
    case "signup_bonus":
      return {
        title: t("bonusSignupTitle"),
        body:
          amount !== null
            ? t("bonusSignupBody", { amount })
            : notification.body,
      };
    case "tour_bonus":
      return {
        title: t("bonusTourTitle"),
        body:
          amount !== null
            ? t("bonusTourBody", { amount })
            : notification.body,
      };
    default:
      return {
        title: notification.title,
        body: notification.body,
      };
  }
}

export function formatNotificationContent(
  notification: Notification,
  actorName: string,
  t: (key: NotificationTranslationKey, values?: TranslationValues) => string
) {
  switch (notification.type) {
    case "like":
      return {
        title: t("likeTitle", { actor: actorName }),
        body: "",
      };
    case "comment":
      return {
        title:
          notification.entity_type === "comment"
            ? // 引用リプライ(返信への返信)は宛先が「あなたの返信」なので文言を分ける。
              // reply_kind が無い既存データは従来どおり replyTitle。
              notification.data?.reply_kind === "reply_to_reply"
              ? t("replyToReplyTitle", { actor: actorName })
              : t("replyTitle", { actor: actorName })
            : t("commentTitle", { actor: actorName }),
        body: getStringValue(notification.data?.comment_content) ?? notification.body,
      };
    case "follow":
      return {
        title: t("followTitle", { actor: actorName }),
        body: "",
      };
    case "derived_post_published": {
      // 見出しは派生者の実名＋原作キャプション。本文は無し (REQ-006)。
      const originCaption = getStringValue(notification.data?.origin_caption);
      return {
        title: originCaption
          ? t("derivedPostTitle", {
              actor: actorName,
              origin: truncateOriginCaption(originCaption),
            })
          : t("derivedPostTitleNoCaption", { actor: actorName }),
        body: "",
      };
    }
    case "bonus":
      return formatBonusNotification(notification, t);
    case "post_moderation_removed":
      // 措置ラベルは「削除」ではなく「公開停止」で統一する (ADR-011 / REQ-025)。
      // 運営が入力した投稿者向け説明は翻訳できないため原文をそのまま出す。
      return {
        title: t("moderationRemovedTitle"),
        body:
          getStringValue(notification.data?.author_facing_reason) ??
          getStringValue(notification.body) ??
          t("moderationRemovedBody"),
      };
    case "post_moderation_appeal_result": {
      const status = getStringValue(notification.data?.appeal_status);
      const title =
        status === "overturned"
          ? t("moderationAppealOverturnedTitle")
          : status === "upheld"
            ? t("moderationAppealUpheldTitle")
            : t("moderationAppealResultTitle");
      return {
        title,
        body:
          getStringValue(notification.data?.decision_note) ??
          getStringValue(notification.body) ??
          "",
      };
    }
    default:
      return {
        title: notification.title,
        body: notification.body,
      };
  }
}
