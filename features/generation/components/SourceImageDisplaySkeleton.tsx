/**
 * 元画像表示用スケルトン（SourceImageDisplayのローディング状態）
 */
export function SourceImageDisplaySkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <div className="p-3 bg-gray-50 border-b">
        <div className="h-4 w-20 animate-pulse rounded bg-gray-200" />
      </div>
      <div className="relative aspect-video animate-pulse bg-gray-200" />
      <div className="p-3 bg-gray-50">
        <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
      </div>
    </div>
  );
}
