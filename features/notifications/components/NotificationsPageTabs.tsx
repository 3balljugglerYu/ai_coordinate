"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useUnreadNotificationCount } from "@/features/notifications/components/UnreadNotificationProvider";
import {
  buildNotificationTabHref,
  type NotificationTab,
} from "@/features/notifications/lib/notification-tab";

interface NotificationsPageTabsProps {
  activeTab: NotificationTab;
}

export function NotificationsPageTabs({
  activeTab,
}: NotificationsPageTabsProps) {
  const t = useTranslations("notifications");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const hasMarkedPageSeenRef = useRef(false);
  const lastSeenTabRef = useRef<NotificationTab | null>(null);
  const {
    hasAnnouncementTabDot,
    markAnnouncementPageSeen,
    markAnnouncementTabSeen,
  } = useUnreadNotificationCount();

  useEffect(() => {
    if (hasMarkedPageSeenRef.current) {
      return;
    }

    hasMarkedPageSeenRef.current = true;
    void markAnnouncementPageSeen();
  }, [markAnnouncementPageSeen]);

  useEffect(() => {
    if (activeTab !== "announcements") {
      lastSeenTabRef.current = activeTab;
      return;
    }

    if (lastSeenTabRef.current === activeTab) {
      return;
    }

    lastSeenTabRef.current = activeTab;
    void markAnnouncementTabSeen();
  }, [activeTab, markAnnouncementTabSeen]);

  const handleTabChange = (nextTab: NotificationTab) => {
    if (nextTab === activeTab) {
      return;
    }

    if (nextTab === "announcements") {
      void markAnnouncementTabSeen();
    }

    startTransition(() => {
      router.push(buildNotificationTabHref(nextTab));
    });
  };

  return (
    <div
      className="border-b border-slate-200 px-4 pt-4"
      role="tablist"
      aria-label={t("tabListLabel")}
    >
      <div className="flex gap-2">
        {(["activity", "announcements"] as const).map((tab) => {
          const isActive = activeTab === tab;
          const label =
            tab === "activity" ? t("activityTab") : t("announcementsTab");
          const showDot = tab === "announcements" && hasAnnouncementTabDot;

          return (
            <button
              key={tab}
              type="button"
              id={`notifications-tab-${tab}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`notifications-panel-${tab}`}
              onClick={() => handleTabChange(tab)}
              className={cn(
                "relative inline-flex min-h-11 items-center gap-2 rounded-t-xl border border-b-0 px-4 py-3 text-sm font-medium transition-colors",
                isActive
                  ? "border-slate-200 bg-white text-slate-900"
                  : "border-transparent bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
              )}
            >
              <span>{label}</span>
              {showDot && (
                <span
                  className="h-2.5 w-2.5 rounded-full bg-red-500"
                  aria-label={t("unreadDotLabel")}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
