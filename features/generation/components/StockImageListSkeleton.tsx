export function StockImageListSkeleton() {
  return (
    <div className="mt-8">
      <div className="mb-3 h-4 w-48 animate-pulse rounded bg-gray-200" />
      <div className="flex gap-3 overflow-x-auto pb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex-shrink-0 w-[140px] sm:w-[160px]">
            <div className="aspect-square animate-pulse rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
