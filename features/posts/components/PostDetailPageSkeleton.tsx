/**
 * 投稿詳細ページ用スケルトン
 */
export function PostDetailPageSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl">
        {/* 画像エリア */}
        <div className="aspect-square w-full animate-pulse bg-gray-200" />

        {/* ユーザー情報・統計 */}
        <div className="border-b bg-white px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 animate-pulse rounded-full bg-gray-200" />
              <div className="space-y-1">
                <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
                <div className="h-3 w-16 animate-pulse rounded bg-gray-100" />
              </div>
            </div>
            <div className="flex gap-3">
              <div className="h-5 w-8 animate-pulse rounded bg-gray-200" />
              <div className="h-5 w-8 animate-pulse rounded bg-gray-200" />
              <div className="h-5 w-8 animate-pulse rounded bg-gray-200" />
            </div>
          </div>
        </div>

        {/* キャプション・コメントエリア */}
        <div className="border-t border-gray-200 bg-white px-4 py-3">
          <div className="mb-4">
            <div className="h-10 w-full animate-pulse rounded-md bg-gray-200" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
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
      </div>
    </div>
  );
}
