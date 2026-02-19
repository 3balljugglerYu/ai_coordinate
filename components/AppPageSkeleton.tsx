/**
 * (app) ルート群用の汎用ローディングスケルトン
 * マイページ、コーディネート、ミッション、お知らせ等で使用
 */
export function AppPageSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pt-6 md:pt-8 pb-8 px-4">
        <div className="mx-auto max-w-6xl">
          {/* タイトルエリア */}
          <div className="mb-6">
            <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
            <div className="mt-2 h-4 w-64 animate-pulse rounded bg-gray-100" />
          </div>
          {/* コンテンツエリア */}
          <div className="space-y-4">
            <div className="h-24 animate-pulse rounded-lg bg-gray-200" />
            <div className="h-48 animate-pulse rounded-lg bg-gray-200" />
            <div className="grid grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="aspect-square animate-pulse rounded-lg bg-gray-200"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
