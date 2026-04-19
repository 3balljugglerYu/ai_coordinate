"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import {
  getAnnouncements,
  markAnnouncementRead,
} from "@/features/announcements/lib/api";
import type { AnnouncementSummaryView } from "@/features/announcements/lib/schema";

export function useAnnouncements(initialAnnouncements?: AnnouncementSummaryView[]) {
  const t = useTranslations("notifications");
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const hasInitialAnnouncements = initialAnnouncements !== undefined;
  const [isNavigating, startTransition] = useTransition();
  const [announcements, setAnnouncements] = useState<AnnouncementSummaryView[]>(
    initialAnnouncements ?? []
  );
  const [isLoading, setIsLoading] = useState(!hasInitialAnnouncements);
  const [pendingAnnouncementId, setPendingAnnouncementId] = useState<string | null>(
    null
  );

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

  useEffect(() => {
    if (pathname?.startsWith("/notifications/announcements/")) {
      setPendingAnnouncementId(null);
      return;
    }

    if (pathname === "/notifications") {
      setPendingAnnouncementId(null);
    }
  }, [pathname]);

  useEffect(() => {
    announcements.slice(0, 5).forEach((announcement) => {
      router.prefetch(`/notifications/announcements/${announcement.id}`);
    });
  }, [announcements, router]);

  const handleAnnouncementClick = useCallback(
    (announcement: AnnouncementSummaryView) => {
      if (pendingAnnouncementId) {
        return;
      }

      setPendingAnnouncementId(announcement.id);
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
          setPendingAnnouncementId((current) =>
            current === announcement.id ? null : current
          );
        });
      }

      startTransition(() => {
        router.push(`/notifications/announcements/${announcement.id}`);
      });
    },
    [pendingAnnouncementId, router, startTransition, t, toast]
  );

  return {
    announcements,
    isLoading,
    isNavigating,
    pendingAnnouncementId,
    refresh: fetchAnnouncements,
    handleAnnouncementClick,
  };
}
