import { Suspense } from "react";
import type { Metadata } from "next";
import { EventImageGalleryWrapper } from "@/features/event/components/EventImageGalleryWrapper";
import { EventImageGallerySkeleton } from "@/features/event/components/EventImageGallerySkeleton";

export const metadata: Metadata = {
  title: "着せ替えお試し用素材 | Persta.AI",
  description: "こちらに掲載しているイラストは、Perstaで着せ替えを試すために、自由にダウンロードして利用できる素材ページです。お好きな画像をダウンロードして、ぜひ着せ替えをお試しください！",
};

export default async function EventDetailPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pt-6 md:pt-8 pb-8 px-4">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">
              着せ替えお試し用素材
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              こちらに掲載しているイラストは、Perstaで着せ替えを試すために、自由にダウンロードして利用できる素材ページです。お好きな画像をダウンロードして、ぜひ着せ替えをお試しください！
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
