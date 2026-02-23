/**
 * ホームバナー用スケルトン（カルーセル形式）
 */
export function HomeBannerSkeleton() {
  return (
    <div className="mb-8 overflow-x-hidden">
      <div className="-mx-4 px-4">
        <div className="aspect-[3/1] w-full animate-pulse rounded-lg bg-gray-200" />
      </div>
      <div className="mt-4 flex justify-center gap-2">
        <div className="h-2 w-2 animate-pulse rounded-full bg-gray-200" />
        <div className="h-2 w-2 animate-pulse rounded-full bg-gray-200" />
        <div className="h-2 w-2 animate-pulse rounded-full bg-gray-200" />
      </div>
    </div>
  );
}
