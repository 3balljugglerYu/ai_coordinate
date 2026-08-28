import { Suspense } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { AppShell } from "@/components/AppShell";
import { Toaster } from "@/components/ui/toaster";
import { UnreadNotificationProvider } from "@/features/notifications/components/UnreadNotificationProvider";
import { MissionDotProvider } from "@/features/challenges/components/MissionDotProvider";
import { Ga4Script } from "@/features/analytics/components/Ga4Script";
import { Ga4LoginStatus } from "@/features/analytics/components/Ga4LoginStatus";
import { VercelAnalyticsScripts } from "@/features/analytics/components/VercelAnalyticsScripts";
import { CoordinateSourceStockSavePromptDialogHost } from "@/features/generation/components/CoordinateSourceStockSavePromptDialogHost";
import { PostProgressHost } from "@/features/posts/components/PostProgressHost";
import { SearchAvailabilityProvider } from "@/features/posts/components/SearchAvailabilityProvider";
import { SearchAvailabilityLoader } from "@/features/posts/components/SearchAvailabilityLoader";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { getClientMessages } from "@/i18n/messages";
import { LocaleDocumentAttributes } from "@/components/LocaleDocumentAttributes";

export async function LocaleShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const messages = await getClientMessages(locale);
  const appContent = (
    <Suspense fallback={<div className="min-h-screen">{children}</div>}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <LocaleDocumentAttributes />
      <UnreadNotificationProvider>
        <MissionDotProvider>
          <SearchAvailabilityProvider>
            {appContent}
            {/*
              検索・ハッシュタグの段階公開。運営だけ true に昇格させる。
              認証を引くため独立した Suspense に置く（ここを appContent と
              同じ境界にすると、全ページが認証待ちになる）。
            */}
            <Suspense fallback={null}>
              <SearchAvailabilityLoader />
            </Suspense>
          </SearchAvailabilityProvider>
        </MissionDotProvider>
      </UnreadNotificationProvider>
      {/*
        ナビゲーション中も生き残る必要があるため、Suspense 境界（appContent）の
        外側にマウントする。AppShell 配下に置くと router.refresh() などで
        Suspense が再活性化した際に Host も unmount され、表示中の
        ストック保存促進モーダルが消えてしまう。
      */}
      <CoordinateSourceStockSavePromptDialogHost />
      {/*
        投稿の「送信中」と「完了」を受け持つ。ここも Suspense 境界の外側。
        中に置くと、投稿後の router.refresh() で unmount され、
        表示中の付与モーダルが消える。
      */}
      <PostProgressHost />
      <Toaster />
      <Ga4Script />
      <Ga4LoginStatus />
      <VercelAnalyticsScripts />
    </NextIntlClientProvider>
  );
}
