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
  | "followTitle"
  | "likeTitle"
  | "replyTitle";

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
            ? t("replyTitle", { actor: actorName })
            : t("commentTitle", { actor: actorName }),
        body: getStringValue(notification.data?.comment_content) ?? notification.body,
      };
    case "follow":
      return {
        title: t("followTitle", { actor: actorName }),
        body: "",
      };
    case "bonus":
      return formatBonusNotification(notification, t);
    default:
      return {
        title: notification.title,
        body: notification.body,
      };
  }
}
