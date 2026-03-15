import { Suspense } from "react";
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { EventImageGalleryWrapper } from "@/features/event/components/EventImageGalleryWrapper";
import { EventImageGallerySkeleton } from "@/features/event/components/EventImageGallerySkeleton";
import { createMarketingPageMetadata } from "@/lib/metadata";
import { DEFAULT_LOCALE, isLocale } from "@/i18n/config";
import { getFreeMaterialsCopy } from "@/i18n/page-copy";

export async function generateMetadata(): Promise<Metadata> {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const copy = getFreeMaterialsCopy(locale);

  return createMarketingPageMetadata({
    title: copy.title,
    description: copy.description,
    path: "/free-materials",
    locale,
    ogTitle: copy.ogTitle,
    ogDescription: copy.ogDescription,
  });
}

async function FreeMaterialsPageContent() {
  const localeValue = await getLocale();
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const copy = getFreeMaterialsCopy(locale);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pt-6 md:pt-8 pb-8 px-4">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">
              {copy.heading}
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              {copy.body}
              <br />
              {copy.mobileHint}
            </p>
          </div>

          <div className="mt-8">
            <Suspense fallback={<EventImageGallerySkeleton />}>
              <EventImageGalleryWrapper />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FreeMaterialsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50">
          <div className="pt-6 md:pt-8 pb-8 px-4">
            <div className="mx-auto max-w-6xl">
              <div className="mb-8">
                <div className="h-9 w-72 animate-pulse rounded bg-gray-200" />
                <div className="mt-3 h-5 w-full max-w-3xl animate-pulse rounded bg-gray-200" />
                <div className="mt-2 h-5 w-full max-w-2xl animate-pulse rounded bg-gray-200" />
              </div>
              <EventImageGallerySkeleton />
            </div>
          </div>
        </div>
      }
    >
      <FreeMaterialsPageContent />
    </Suspense>
  );
}
