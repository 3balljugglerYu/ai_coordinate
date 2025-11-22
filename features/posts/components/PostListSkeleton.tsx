import { Card, CardContent } from "@/components/ui/card";

export function PostListSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="overflow-hidden">
          <div className="relative aspect-square w-full animate-pulse bg-gray-200" />
          <CardContent className="px-2 pt-2 pb-2">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 animate-pulse rounded-full bg-gray-200" />
              <div className="h-4 w-20 animate-pulse rounded bg-gray-200" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

