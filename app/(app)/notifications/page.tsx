import { connection } from "next/server";
import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { requireAuth } from "@/lib/auth";
import { CachedAnnouncementList } from "@/features/announcements/components/CachedAnnouncementList";
import { CachedNotificationList } from "@/features/notifications/components/CachedNotificationList";
import { NotificationsPageTabs } from "@/features/notifications/components/NotificationsPageTabs";
import { parseNotificationTab } from "@/features/notifications/lib/notification-tab";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";

interface NotificationsPageProps {
  searchParams?: Promise<{
    tab?: string | string[];
  }>;
}

export default async function NotificationsPage({
  searchParams,
}: NotificationsPageProps) {
  await connection();

  const paramsPromise: Promise<{ tab?: string | string[] }> =
    searchParams ?? Promise.resolve({});
  const localePromise = getLocale();
  const userPromise = requireAuth();
  const [params, t] = await Promise.all([
    paramsPromise,
    getTranslations("notifications"),
  ]);
  const activeTab = parseNotificationTab(params.tab);

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
              <Suspense fallback={<NotificationsPanelFallback activeTab={activeTab} />}>
                <NotificationsPanel
                  activeTab={activeTab}
                  userPromise={userPromise}
                  localePromise={localePromise}
                />
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

async function NotificationsPanel({
  activeTab,
  userPromise,
  localePromise,
}: {
  activeTab: ReturnType<typeof parseNotificationTab>;
  userPromise: ReturnType<typeof requireAuth>;
  localePromise: ReturnType<typeof getLocale>;
}) {
  const user = await userPromise;

  if (activeTab === "activity") {
    return <CachedNotificationList userId={user.id} autoMarkAllRead />;
  }

  const localeValue = await localePromise;
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;

  return <CachedAnnouncementList userId={user.id} locale={locale} />;
}

function NotificationsPanelFallback({
  activeTab,
}: {
  activeTab: ReturnType<typeof parseNotificationTab>;
}) {
  if (activeTab === "activity") {
    return (
      <div className="flex flex-col gap-2 p-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="h-10 w-10 rounded-full bg-gray-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 rounded bg-gray-200" />
              <div className="h-3 w-1/2 rounded bg-gray-200" />
            </div>
          </div>
        ))}
      </div>
    );
  }

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
