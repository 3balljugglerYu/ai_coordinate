/**
 * コメントセクションのスケルトンUI
 */
export function CommentSectionSkeleton() {
  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3">
      <div className="mb-4">
        <div className="h-10 w-full animate-pulse rounded-md bg-gray-200" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-gray-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
              <div className="h-4 w-full animate-pulse rounded bg-gray-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

