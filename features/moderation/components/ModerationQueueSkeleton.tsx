/**
 * モデレーションキュー用スケルトン
 */
export function ModerationQueueSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-md border p-4">
          <div className="flex items-start gap-4">
            <div className="h-24 w-24 animate-pulse rounded bg-gray-200" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
              <div className="h-3 w-48 animate-pulse rounded bg-gray-100" />
              <div className="h-3 w-32 animate-pulse rounded bg-gray-100" />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-8 w-20 animate-pulse rounded bg-gray-200" />
              <div className="h-8 w-16 animate-pulse rounded bg-gray-200" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
