"use client";

import { useMemo } from "react";
import { FileText } from "lucide-react";
import { AnnouncementListItem } from "./AnnouncementListItem";
import { useAnnouncements } from "@/features/announcements/hooks/useAnnouncements";
import { useTranslations } from "next-intl";
import type { AnnouncementSummaryView } from "@/features/announcements/lib/schema";

interface AnnouncementListProps {
  initialAnnouncements?: AnnouncementSummaryView[];
}

export function AnnouncementList({
  initialAnnouncements,
}: AnnouncementListProps) {
  const t = useTranslations("notifications");
  const {
    announcements,
    isLoading,
    isNavigating,
    pendingAnnouncementId,
    handleAnnouncementClick,
  } =
    useAnnouncements(initialAnnouncements);
  const disabledAnnouncementId = useMemo(
    () => pendingAnnouncementId,
    [pendingAnnouncementId]
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        {[...Array(4)].map((_, index) => (
          <div
            key={index}
            className="animate-pulse rounded-xl border border-slate-200 p-4"
          >
            <div className="h-4 w-3/4 rounded bg-slate-200" />
            <div className="mt-2 h-3 w-1/3 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  if (announcements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-10 text-center">
        <FileText className="h-8 w-8 text-slate-400" aria-hidden />
        <p className="mt-3 text-sm text-slate-500">{t("announcementsEmpty")}</p>
      </div>
    );
  }

  return (
    <div className="divide-y">
      {announcements.map((announcement) => (
        <AnnouncementListItem
          key={announcement.id}
          announcement={announcement}
          disabled={isNavigating}
          isPending={disabledAnnouncementId === announcement.id}
          onClick={handleAnnouncementClick}
        />
      ))}
    </div>
  );
}
