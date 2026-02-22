/**
 * コメント一覧の追加読み込み用スケルトン
 */
export function CommentLoadMoreSkeleton() {
  return (
    <div className="space-y-3 border-t border-gray-200 py-4">
      {[1, 2].map((i) => (
        <div key={i} className="flex gap-3 animate-pulse">
          <div className="h-8 w-8 shrink-0 rounded-full bg-gray-200" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 rounded bg-gray-200" />
            <div className="h-4 w-full rounded bg-gray-200" />
          </div>
        </div>
      ))}
    </div>
  );
}
