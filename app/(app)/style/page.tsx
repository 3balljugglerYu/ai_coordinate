import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { StylePageClient } from "@/features/style/components/StylePageClient";
import { StylePageShareButton } from "@/features/style/components/StylePageShareButton";
import { getPublishedStylePresets } from "@/features/style-presets/lib/get-public-style-presets";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { getUser } from "@/lib/auth";
import { createMarketingPageMetadata } from "@/lib/metadata";

interface StylePageProps {
  searchParams?: Promise<{
    style?: string;
  }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const t = await getTranslations("style");
  const metadata = createMarketingPageMetadata({
    title: t("pageTitle"),
    description: t("pageDescription"),
    path: "/style",
    locale,
  });

  return {
    ...metadata,
    openGraph: {
      ...metadata.openGraph,
      images: [
        {
          url: "/og/one-tap-style.png",
          width: 1200,
          height: 630,
          alt: `${t("pageTitle")} | Persta.AI`,
        },
      ],
    },
    twitter: {
      ...metadata.twitter,
      images: ["/og/one-tap-style.png"],
    },
  };
}

export default async function StylePage({ searchParams }: StylePageProps) {
  const t = await getTranslations("style");
  const presets = await getPublishedStylePresets();
  const user = await getUser();
  const params = (await searchParams) ?? {};

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-4 pb-8 pt-6 md:pb-10 md:pt-8">
        <div className="mx-auto max-w-3xl space-y-8">
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-3xl font-bold text-gray-900">
                {t("pageTitle")}
              </h1>
              <StylePageShareButton />
            </div>
            <p className="text-sm font-medium text-gray-700">
              {t("pageDescription")}
            </p>
          </div>

          <StylePageClient
            presets={presets}
            initialAuthState={user ? "authenticated" : "guest"}
            initialSelectedPresetId={params.style ?? null}
          />
        </div>
      </div>
    </div>
  );
}
