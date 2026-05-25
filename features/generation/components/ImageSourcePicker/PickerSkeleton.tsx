interface PickerSkeletonProps {
  /** ダミー枚数。既定 6。 */
  count?: number;
}

export function PickerSkeleton({ count = 6 }: PickerSkeletonProps) {
  return (
    <div
      className="grid grid-cols-3 gap-2 md:grid-cols-4"
      aria-hidden="true"
      data-testid="picker-skeleton"
    >
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="aspect-square animate-pulse rounded-md bg-gray-200"
        />
      ))}
    </div>
  );
}
