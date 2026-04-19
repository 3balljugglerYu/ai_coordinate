import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { requireAuth } from "@/lib/auth";
import { AnnouncementList } from "@/features/announcements/components/AnnouncementList";
import { CachedNotificationList } from "@/features/notifications/components/CachedNotificationList";
import { NotificationsPageTabs } from "@/features/notifications/components/NotificationsPageTabs";
import { parseNotificationTab } from "@/features/notifications/lib/notification-tab";

interface NotificationsPageProps {
  searchParams?: Promise<{
    tab?: string | string[];
  }>;
}

export default async function NotificationsPage({
  searchParams,
}: NotificationsPageProps) {
  const params = (await searchParams) ?? {};
  const activeTab = parseNotificationTab(params.tab);
  const t = await getTranslations("notifications");
  const user = await requireAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pt-6 md:pt-8 pb-8 px-4">
        <div className="mx-auto max-w-2xl">
          <h1 className="mb-4 text-xl font-semibold text-gray-900">{t("pageTitle")}</h1>
          <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
            <NotificationsPageTabs activeTab={activeTab} />
            <div
              id={`notifications-panel-${activeTab}`}
              role="tabpanel"
              aria-labelledby={`notifications-tab-${activeTab}`}
            >
              {activeTab === "activity" ? (
                <Suspense
                  fallback={
                    <div className="flex flex-col gap-2 p-4">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="flex gap-3 animate-pulse">
                          <div className="w-10 h-10 rounded-full bg-gray-200" />
                          <div className="flex-1 space-y-2">
                            <div className="h-4 bg-gray-200 rounded w-3/4" />
                            <div className="h-3 bg-gray-200 rounded w-1/2" />
                          </div>
                        </div>
                      ))}
                    </div>
                  }
                >
                  <CachedNotificationList userId={user.id} autoMarkAllRead />
                </Suspense>
              ) : (
                <AnnouncementList />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
