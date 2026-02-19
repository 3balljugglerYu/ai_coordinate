/**
 * グローバルページローディング用スケルトン
 * app/loading.tsx で使用
 */
export function PageLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="space-y-6">
          {/* ヘッダー風スケルトン */}
          <div className="flex items-center justify-between">
            <div className="h-9 w-24 animate-pulse rounded bg-muted" />
            <div className="h-9 w-32 animate-pulse rounded bg-muted" />
          </div>
          {/* メインコンテンツ風スケルトン */}
          <div className="aspect-square max-w-md animate-pulse rounded-lg bg-muted" />
          <div className="space-y-2">
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}
