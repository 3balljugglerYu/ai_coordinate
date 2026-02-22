/**
 * マイページ画像詳細ページ用スケルトン
 */
export function ImageDetailSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto max-w-4xl">
        {/* ヘッダー */}
        <div className="mb-6 flex items-center justify-between">
          <div className="h-9 w-20 animate-pulse rounded bg-gray-200" />
          <div className="flex gap-2">
            <div className="h-9 w-16 animate-pulse rounded bg-gray-200" />
            <div className="h-9 w-16 animate-pulse rounded bg-gray-200" />
          </div>
        </div>

        {/* 画像カード */}
        <div className="mb-6 overflow-hidden rounded-lg">
          <div className="aspect-square w-full animate-pulse bg-gray-200" />
        </div>

        {/* 詳細情報カード */}
        <div className="rounded-lg border bg-white p-6">
          <div className="mb-4 h-6 w-32 animate-pulse rounded bg-gray-200" />
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-20 animate-pulse rounded bg-gray-200" />
                <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
