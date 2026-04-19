"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { AnnouncementDetail } from "@/features/announcements/components/AnnouncementDetail";
import { markAnnouncementRead } from "@/features/announcements/lib/api";
import type { AnnouncementDetailView } from "@/features/announcements/lib/schema";

interface AnnouncementDetailScreenProps {
  announcement: AnnouncementDetailView;
}

export function AnnouncementDetailScreen({
  announcement,
}: AnnouncementDetailScreenProps) {
  const t = useTranslations("notifications");
  const { toast } = useToast();
  const hasMarkedReadRef = useRef(false);

  useEffect(() => {
    if (announcement.isRead || hasMarkedReadRef.current) {
      return;
    }

    hasMarkedReadRef.current = true;
    void markAnnouncementRead(announcement.id, {
      markReadFailed: t("announcementsMarkReadFailed"),
    }).catch((error) => {
      console.error("Failed to mark announcement as read:", error);
      toast({
        title: t("errorTitle"),
        description:
          error instanceof Error
            ? error.message
            : t("announcementsMarkReadFailed"),
        variant: "destructive",
      });
    });
  }, [announcement.id, announcement.isRead, t, toast]);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <Button asChild variant="ghost" size="sm" className="px-0 text-slate-600">
        <Link href="/notifications?tab=announcements">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t("announcementsBackToList")}
        </Link>
      </Button>

      <div className="space-y-2">
        <p className="text-sm text-slate-500">
          {t("announcementsPublishedLabel", {
            date: announcement.publishedAtLabel,
          })}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {announcement.title}
        </h1>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <AnnouncementDetail bodyJson={announcement.bodyJson} />
      </div>
    </div>
  );
}
