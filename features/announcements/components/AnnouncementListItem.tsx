"use client";

import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { AnnouncementSummary } from "@/features/announcements/lib/schema";

interface AnnouncementListItemProps {
  announcement: AnnouncementSummary;
  onClick: (announcement: AnnouncementSummary) => void;
}

function formatDate(value: string, locale: string) {
  return new Date(value).toLocaleDateString(locale === "ja" ? "ja-JP" : "en-US", {
    year: "numeric",
    month: locale === "ja" ? "2-digit" : "short",
    day: "2-digit",
  });
}

export function AnnouncementListItem({
  announcement,
  onClick,
}: AnnouncementListItemProps) {
  const t = useTranslations("notifications");
  const locale = useLocale();

  return (
    <button
      type="button"
      onClick={() => onClick(announcement)}
      className={cn(
        "flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-slate-50",
        !announcement.isRead && "bg-rose-50/40"
      )}
    >
      <div className="flex-1 space-y-1">
        <p className="text-sm font-medium text-slate-900">{announcement.title}</p>
        <p className="text-xs text-slate-500">
          {formatDate(announcement.publishAt, locale)}
        </p>
      </div>
      {!announcement.isRead && (
        <span
          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500"
          aria-label={t("unreadDotLabel")}
        />
      )}
    </button>
  );
}
