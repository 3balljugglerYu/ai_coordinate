import { Suspense } from "react";
import type { Metadata } from "next";
import { EventImageGalleryWrapper } from "@/features/event/components/EventImageGalleryWrapper";
import { EventImageGallerySkeleton } from "@/features/event/components/EventImageGallerySkeleton";
import { createMarketingPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createMarketingPageMetadata({
  title: "着せ替えお試し用素材 | Persta.AI",
  description:
    "こちらに掲載しているイラストは、Perstaで着せ替えを試すために、自由にダウンロードして利用できる素材ページです。お好きな画像をダウンロードして、ぜひ着せ替えをお試しください！",
  path: "/event/detail/01",
  ogTitle: "着せ替えお試し用素材",
  ogDescription:
    "Perstaで着せ替えを試すためのフリー素材。イラストをダウンロードして着せ替えをお試しください。",
});

export default async function EventDetailPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pt-6 md:pt-8 pb-8 px-4">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">
              着せ替えフリー素材
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Perstaで着せ替えを試せるイラスト素材です。画像はダウンロードしてご利用ください。
              <br />
              ※モバイル端末では画像を長押しすると保存できます。
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
