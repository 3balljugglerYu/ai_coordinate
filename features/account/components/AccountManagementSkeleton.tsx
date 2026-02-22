/**
 * ブロックユーザー一覧用スケルトン
 */
export function BlockListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-3 rounded-md border p-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 animate-pulse rounded-full bg-gray-200" />
            <div className="space-y-2">
              <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
              <div className="h-3 w-32 animate-pulse rounded bg-gray-100" />
            </div>
          </div>
          <div className="h-8 w-16 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}

/**
 * 通報済みコンテンツ一覧用スケルトン
 */
export function ReportedContentListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2].map((i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-3 rounded-md border p-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-14 w-14 animate-pulse rounded bg-gray-200" />
            <div className="h-4 w-40 animate-pulse rounded bg-gray-200" />
          </div>
          <div className="h-8 w-20 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}
