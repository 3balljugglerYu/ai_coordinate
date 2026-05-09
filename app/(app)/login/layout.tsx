import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { createMarketingPageMetadata } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const t = await getTranslations("auth");

  const metadata = createMarketingPageMetadata({
    title: t("signinTitle"),
    description: t("signinDescription"),
    path: "/login",
    locale,
  });

  return {
    ...metadata,
    robots: {
      index: false,
      follow: true,
    },
  };
}

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
