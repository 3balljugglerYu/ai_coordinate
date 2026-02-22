interface StockImageListSkeletonProps {
  /** ラベルを表示するか（GenerationForm用はtrue、StockImageList用はfalse） */
  showLabel?: boolean;
}

export function StockImageListSkeleton({ showLabel = true }: StockImageListSkeletonProps) {
  return (
    <div className={showLabel ? "mt-8" : ""}>
      {showLabel && (
        <div className="mb-3 h-4 w-48 animate-pulse rounded bg-gray-200" />
      )}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex-shrink-0 w-[140px] sm:w-[160px] max-w-[200px]">
            <div className="aspect-square max-h-[200px] animate-pulse rounded-lg bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
