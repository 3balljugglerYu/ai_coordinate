/**
 * 非同期画像生成ステータス用スケルトン
 */
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function AsyncGenerationStatusSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-6 w-40 animate-pulse rounded bg-gray-200" />
        <div className="mt-1 h-4 w-56 animate-pulse rounded bg-gray-100" />
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center gap-4 py-8">
          <div className="h-32 w-32 animate-pulse rounded-lg bg-gray-200" />
          <div className="h-4 w-32 animate-pulse rounded bg-gray-100" />
        </div>
      </CardContent>
    </Card>
  );
}
