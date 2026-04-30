import { connection } from "next/server";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { StylePageClient } from "@/features/style/components/StylePageClient";
import { StylePageShareButton } from "@/features/style/components/StylePageShareButton";
import { GuestGenerationTrialCta } from "@/features/generation/components/GuestGenerationTrialCta";
import { getPublishedStylePresets } from "@/features/style-presets/lib/get-public-style-presets";
import { getTotalStyleGenerateCount } from "@/features/style/lib/style-usage-stats";
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
  await connection();

  const t = await getTranslations("style");
  const presets = await getPublishedStylePresets();
  const user = await getUser();
  const params = (await searchParams) ?? {};
  const totalGenerationCount = await getTotalStyleGenerateCount().catch(
    () => null
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-4 pb-8 pt-6 md:pb-10 md:pt-8">
        <div className="mx-auto max-w-3xl space-y-8">
          {typeof totalGenerationCount === "number" &&
          totalGenerationCount > 0 ? (
            <div
              data-testid="style-total-generation-count"
              className="relative overflow-hidden rounded-xl border border-[#B7BDC6] bg-[linear-gradient(135deg,#F9FBFF_0%,#E6F0FF_20%,#E5E4E2_45%,#CBD6E3_70%,#FFFFFF_100%)] px-4 py-3 text-center shadow-[0_0_12px_rgba(216,235,255,0.8),0_0_28px_rgba(216,235,255,0.45)] transition-shadow hover:shadow-[0_0_16px_rgba(216,235,255,0.9),0_0_32px_rgba(216,235,255,0.6)]"
            >
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent,45%,#D8EBFF,55%,transparent)] bg-[length:250%_100%] animate-shine opacity-60 mix-blend-overlay" />
              <span className="relative z-10 block text-sm font-semibold text-slate-900">
                {t("totalGenerationCount", {
                  count: totalGenerationCount.toLocaleString(),
                })}
              </span>
            </div>
          ) : null}

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

          {!user ? (
            <GuestGenerationTrialCta
              title={t("guestLoginCtaTitle")}
              description={t("guestLoginCtaDescription")}
              actionLabel={t("guestLoginCtaAction")}
              testId="style-guest-login-cta"
            />
          ) : null}

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
