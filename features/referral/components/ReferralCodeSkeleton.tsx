/**
 * 紹介コード表示用スケルトン
 */
export function ReferralCodeSkeleton() {
  return (
    <div className="rounded-lg border p-6">
      <div className="space-y-6">
        {/* 紹介リンク */}
        <div>
          <div className="mb-2 h-5 w-24 animate-pulse rounded bg-gray-200" />
          <div className="flex items-center gap-2">
            <div className="h-10 flex-1 animate-pulse rounded-md bg-gray-200" />
            <div className="h-10 w-10 animate-pulse rounded-md bg-gray-200" />
          </div>
        </div>

        {/* QRコード */}
        <div>
          <div className="mb-2 h-5 w-24 animate-pulse rounded bg-gray-200" />
          <div className="flex flex-col items-center gap-4">
            <div className="h-[200px] w-[200px] animate-pulse rounded-lg bg-gray-200" />
            <div className="h-4 w-40 animate-pulse rounded bg-gray-100" />
          </div>
        </div>

        {/* 説明 */}
        <div className="border-t pt-4">
          <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
        </div>
      </div>
    </div>
  );
}
