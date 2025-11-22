import { Card, CardContent } from "@/components/ui/card";

export function CoordinatePageSkeleton() {
  return (
    <div className="space-y-8">
      {/* フォームスケルトン */}
      <Card className="p-6">
        <div className="space-y-4">
          <div className="h-10 w-full animate-pulse rounded bg-gray-200" />
          <div className="h-24 w-full animate-pulse rounded bg-gray-200" />
          <div className="h-10 w-32 animate-pulse rounded bg-gray-200" />
        </div>
      </Card>

      {/* 生成結果スケルトン */}
      <div>
        <div className="mb-4 h-7 w-32 animate-pulse rounded bg-gray-200" />
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <div className="relative aspect-square w-full animate-pulse bg-gray-200" />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

