"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import {
  getAnnouncements,
  markAnnouncementRead,
} from "@/features/announcements/lib/api";
import type { AnnouncementSummary } from "@/features/announcements/lib/schema";

export function useAnnouncements(initialAnnouncements?: AnnouncementSummary[]) {
  const t = useTranslations("notifications");
  const router = useRouter();
  const { toast } = useToast();
  const hasInitialAnnouncements = initialAnnouncements !== undefined;
  const [announcements, setAnnouncements] = useState<AnnouncementSummary[]>(
    initialAnnouncements ?? []
  );
  const [isLoading, setIsLoading] = useState(!hasInitialAnnouncements);

  const fetchAnnouncements = useCallback(async () => {
    setIsLoading(true);
    try {
      const nextAnnouncements = await getAnnouncements({
        fetchListFailed: t("announcementsFetchFailed"),
      });
      setAnnouncements(nextAnnouncements);
    } catch (error) {
      console.error("Failed to fetch announcements:", error);
      toast({
        title: t("errorTitle"),
        description:
          error instanceof Error
            ? error.message
            : t("announcementsFetchFailed"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    if (hasInitialAnnouncements) {
      return;
    }

    void fetchAnnouncements();
  }, [fetchAnnouncements, hasInitialAnnouncements]);

  const handleAnnouncementClick = useCallback(
    (announcement: AnnouncementSummary) => {
      const wasUnread = !announcement.isRead;

      if (wasUnread) {
        setAnnouncements((current) =>
          current.map((currentAnnouncement) =>
            currentAnnouncement.id === announcement.id
              ? {
                  ...currentAnnouncement,
                  isRead: true,
                  readAt: new Date().toISOString(),
                }
              : currentAnnouncement
          )
        );

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
          setAnnouncements((current) =>
            current.map((currentAnnouncement) =>
              currentAnnouncement.id === announcement.id
                ? {
                    ...currentAnnouncement,
                    isRead: false,
                    readAt: null,
                  }
                : currentAnnouncement
            )
          );
        });
      }

      router.push(`/notifications/announcements/${announcement.id}`);
    },
    [router, t, toast]
  );

  return {
    announcements,
    isLoading,
    refresh: fetchAnnouncements,
    handleAnnouncementClick,
  };
}
