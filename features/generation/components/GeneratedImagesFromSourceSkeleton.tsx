import { Card } from "@/components/ui/card";

export function GeneratedImagesFromSourceSkeleton() {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="h-4 w-48 rounded bg-gray-200 animate-pulse" />
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {/* 生成画像カードのスケルトン（4個） */}
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex-shrink-0 w-[140px] sm:w-[160px]">
            <Card className="relative overflow-hidden p-0">
              <div className="relative w-full aspect-square bg-gray-200 animate-pulse" />
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}

