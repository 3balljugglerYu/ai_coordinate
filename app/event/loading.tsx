import { EventImageGallerySkeleton } from "@/features/event/components/EventImageGallerySkeleton";

/**
 * イベント詳細画面用ローディング
 */
export default function EventLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pt-6 md:pt-8 pb-8 px-4">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8">
            <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
            <div className="mt-2 h-4 w-96 animate-pulse rounded bg-gray-100" />
          </div>
          <div className="mt-8">
            <EventImageGallerySkeleton />
          </div>
        </div>
      </div>
    </div>
  );
}
