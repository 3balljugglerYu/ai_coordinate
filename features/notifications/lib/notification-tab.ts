export type NotificationTab = "activity" | "announcements";

const VALID_NOTIFICATION_TABS = new Set<NotificationTab>([
  "activity",
  "announcements",
]);

export function parseNotificationTab(tab: string | string[] | undefined | null): NotificationTab {
  if (Array.isArray(tab)) {
    return parseNotificationTab(tab[0]);
  }

  if (tab && VALID_NOTIFICATION_TABS.has(tab as NotificationTab)) {
    return tab as NotificationTab;
  }

  return "activity";
}

export function buildNotificationTabHref(tab: NotificationTab) {
  return tab === "activity" ? "/notifications" : "/notifications?tab=announcements";
}
