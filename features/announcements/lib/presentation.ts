import type { Locale } from "@/i18n/config";
import type {
  AnnouncementAdmin,
  AnnouncementAdminView,
  AnnouncementDetail,
  AnnouncementDetailView,
  AnnouncementSummary,
  AnnouncementSummaryView,
} from "./schema";

function toIntlLocale(locale: Locale) {
  return locale === "ja" ? "ja-JP" : "en-US";
}

function formatAnnouncementListDate(value: string, locale: Locale) {
  return new Date(value).toLocaleDateString(toIntlLocale(locale), {
    year: "numeric",
    month: locale === "ja" ? "2-digit" : "short",
    day: "2-digit",
  });
}

function formatAnnouncementDetailDate(value: string, locale: Locale) {
  return new Date(value).toLocaleDateString(toIntlLocale(locale), {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatAnnouncementAdminDate(value: string | null) {
  if (!value) {
    return "未設定";
  }

  return new Date(value).toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getAnnouncementAdminStatus(
  announcement: AnnouncementAdmin,
  now: Date
): Pick<
  AnnouncementAdminView,
  "displayStatusLabel" | "displayStatusClassName"
> {
  if (announcement.status === "draft") {
    return {
      displayStatusLabel: "下書き",
      displayStatusClassName: "bg-slate-100 text-slate-700",
    };
  }

  if (
    announcement.publishAt &&
    new Date(announcement.publishAt).getTime() > now.getTime()
  ) {
    return {
      displayStatusLabel: "公開予約",
      displayStatusClassName: "bg-amber-100 text-amber-800",
    };
  }

  return {
    displayStatusLabel: "公開中",
    displayStatusClassName: "bg-emerald-100 text-emerald-800",
  };
}

export function decorateAnnouncementAdmin(
  announcement: AnnouncementAdmin,
  now = new Date()
): AnnouncementAdminView {
  return {
    ...announcement,
    publishAtDisplay: formatAnnouncementAdminDate(announcement.publishAt),
    ...getAnnouncementAdminStatus(announcement, now),
  };
}

export function decorateAnnouncementSummary(
  announcement: AnnouncementSummary,
  locale: Locale
): AnnouncementSummaryView {
  return {
    ...announcement,
    publishAtLabel: formatAnnouncementListDate(announcement.publishAt, locale),
  };
}

export function decorateAnnouncementDetail(
  announcement: AnnouncementDetail,
  locale: Locale
): AnnouncementDetailView {
  return {
    ...announcement,
    publishedAtLabel: formatAnnouncementDetailDate(
      announcement.publishAt,
      locale
    ),
  };
}
