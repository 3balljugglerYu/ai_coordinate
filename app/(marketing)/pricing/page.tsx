import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { ROUTES } from "@/constants";
import { createMarketingPageMetadata } from "@/lib/metadata";
import { DEFAULT_LOCALE, isLocale, localizePublicPath } from "@/i18n/config";

export async function generateMetadata(): Promise<Metadata> {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;

  return createMarketingPageMetadata({
    title: locale === "ja" ? "料金" : "Pricing",
    description:
      locale === "ja"
        ? "Persta.AI の料金と支払い条件"
        : "Pricing and payment terms for Persta.AI",
    path: "/pricing",
    locale,
  });
}

interface PricingPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const params = await searchParams;
  const nextSearchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => nextSearchParams.append(key, entry));
      return;
    }
    if (value) {
      nextSearchParams.set(key, value);
    }
  });

  if (!nextSearchParams.has("tab")) {
    nextSearchParams.set("tab", "subscription");
  }

  const destination = localizePublicPath(ROUTES.CREDITS_PURCHASE, locale);
  redirect(`${destination}?${nextSearchParams.toString()}`);
}
