import { Suspense } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { AppShell } from "@/components/AppShell";
import { Toaster } from "@/components/ui/toaster";
import { UnreadNotificationProvider } from "@/features/notifications/components/UnreadNotificationProvider";
import { Ga4Script } from "@/features/analytics/components/Ga4Script";
import { VercelAnalyticsScripts } from "@/features/analytics/components/VercelAnalyticsScripts";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { getClientMessages } from "@/i18n/messages";

export async function LocaleShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const messages = await getClientMessages(locale);

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <UnreadNotificationProvider>
        <Suspense fallback={<div className="min-h-screen">{children}</div>}>
          <AppShell>{children}</AppShell>
        </Suspense>
      </UnreadNotificationProvider>
      <Toaster />
      <Ga4Script />
      <VercelAnalyticsScripts />
    </NextIntlClientProvider>
  );
}

