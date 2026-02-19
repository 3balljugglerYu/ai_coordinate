/**
 * 通知一覧の追加読み込み用スケルトン
 */
export function NotificationLoadMoreSkeleton() {
  return (
    <div className="flex flex-col divide-y border-t">
      {[1, 2].map((i) => (
        <div key={i} className="flex gap-3 p-4 animate-pulse">
          <div className="w-10 h-10 flex-shrink-0 rounded-full bg-gray-200" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 rounded w-3/4" />
            <div className="h-3 bg-gray-200 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
