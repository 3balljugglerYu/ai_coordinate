import { Card } from "@/components/ui/card";

/**
 * WebP統計カード用スケルトン
 */
export function WebPStatsCardSkeleton() {
  return (
    <Card className="p-6">
      <div className="mb-4 h-8 w-48 animate-pulse rounded bg-gray-200" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
            <div className="h-9 w-16 animate-pulse rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </Card>
  );
}
