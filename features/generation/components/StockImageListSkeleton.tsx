import { Card } from "@/components/ui/card";

export function StockImageListSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
      {/* アップロードカードのスケルトン */}
      <div className="flex-shrink-0 w-[140px] sm:w-[160px]">
        <Card className="relative overflow-hidden w-full border-2 border-dashed border-gray-300">
          <div className="relative aspect-square flex flex-col items-center justify-center p-4">
            <div className="mb-2 h-8 w-8 rounded bg-gray-200 animate-pulse" />
            <div className="h-3 w-20 rounded bg-gray-200 animate-pulse" />
          </div>
        </Card>
      </div>
      {/* ストック画像カードのスケルトン（3個） */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex-shrink-0 w-[140px] sm:w-[160px]">
          <Card className="relative overflow-hidden p-0">
            <div className="relative w-full aspect-square bg-gray-200 animate-pulse" />
          </Card>
        </div>
      ))}
    </div>
  );
}

