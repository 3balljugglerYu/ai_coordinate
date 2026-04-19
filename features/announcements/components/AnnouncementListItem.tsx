"use client";

import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { AnnouncementSummary } from "@/features/announcements/lib/schema";

interface AnnouncementListItemProps {
  announcement: AnnouncementSummary;
  disabled?: boolean;
  isPending?: boolean;
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
  disabled = false,
  isPending = false,
  onClick,
}: AnnouncementListItemProps) {
  const t = useTranslations("notifications");
  const locale = useLocale();

  return (
    <button
      type="button"
      aria-busy={isPending}
      disabled={disabled}
      onClick={() => onClick(announcement)}
      className={cn(
        "flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-slate-50 disabled:cursor-wait",
        isPending && "bg-slate-100/80 opacity-80",
        !isPending && !announcement.isRead && "bg-rose-50/40"
      )}
    >
      <div className="flex-1 space-y-1">
        <p className="text-sm font-medium text-slate-900">{announcement.title}</p>
        <p className="text-xs text-slate-500">
          {formatDate(announcement.publishAt, locale)}
        </p>
      </div>
      {isPending && (
        <Loader2
          className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-slate-500"
          aria-hidden
        />
      )}
      {!isPending && !announcement.isRead && (
        <span
          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500"
          aria-label={t("unreadDotLabel")}
        />
      )}
    </button>
  );
}
