export function GeneratedImageGallerySkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="aspect-square animate-pulse rounded bg-gray-200" />
      ))}
    </div>
  );
}
