import { Card } from "@/components/ui/card";

export function CreditsPageSkeleton() {
  return (
    <>
      {/* ペルコイン残高カードスケルトン */}
      <Card className="mb-8 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 animate-pulse rounded-full bg-gray-200" />
            <div>
              <div className="mb-2 h-4 w-24 animate-pulse rounded bg-gray-200" />
              <div className="h-8 w-32 animate-pulse rounded bg-gray-200" />
            </div>
          </div>
        </div>
      </Card>

      {/* ペルコイン購入セクションスケルトン */}
      <div className="mb-8">
        <div className="mb-4 h-7 w-32 animate-pulse rounded bg-gray-200" />
        <Card className="p-6">
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 w-full animate-pulse rounded bg-gray-200" />
            ))}
          </div>
        </Card>
      </div>

      {/* 取引履歴スケルトン */}
      <div className="mb-8">
        <div className="mb-4 h-7 w-32 animate-pulse rounded bg-gray-200" />
        <Card className="p-4">
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 w-full animate-pulse rounded bg-gray-200" />
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
