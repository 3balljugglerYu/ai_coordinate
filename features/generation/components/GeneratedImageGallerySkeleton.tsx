export function GeneratedImageGallerySkeleton() {
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="h-7 w-32 animate-pulse rounded bg-gray-200" />
        <div className="h-8 w-32 animate-pulse rounded bg-gray-200" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square animate-pulse rounded bg-gray-200"
          />
        ))}
      </div>
    </>
  );
}
