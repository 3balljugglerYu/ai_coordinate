import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export function MyPageSkeleton() {
  return (
    <>

      {/* クレジット残高カード */}
      <Card className="mb-8 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 animate-pulse rounded-full bg-gray-200" />
            <div>
              <div className="mb-2 h-4 w-24 animate-pulse rounded bg-gray-200" />
              <div className="h-8 w-32 animate-pulse rounded bg-gray-200" />
            </div>
          </div>
          <div className="h-10 w-20 animate-pulse rounded bg-gray-200" />
        </div>
      </Card>

      {/* 画像一覧スケルトン */}
      <div>
        <div className="mb-4 h-7 w-32 animate-pulse rounded bg-gray-200" />
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <div className="relative aspect-square w-full animate-pulse bg-gray-200" />
              <CardContent className="p-3">
                <div className="h-4 w-full animate-pulse rounded bg-gray-200" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}

