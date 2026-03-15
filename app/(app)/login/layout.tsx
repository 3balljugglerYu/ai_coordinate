import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";

export async function generateMetadata(): Promise<Metadata> {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;

  return {
    title: locale === "ja" ? "ログイン | Persta.AI" : "Log in | Persta.AI",
    description:
      locale === "ja" ? "Persta.AI にログイン" : "Log in to Persta.AI",
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
