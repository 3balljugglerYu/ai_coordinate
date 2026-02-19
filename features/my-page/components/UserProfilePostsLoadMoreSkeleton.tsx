import { Card } from "@/components/ui/card";

/**
 * ユーザープロフィール投稿一覧の追加読み込み用スケルトン
 */
export function UserProfilePostsLoadMoreSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="overflow-hidden p-0">
          <div className="relative aspect-square w-full animate-pulse bg-gray-200" />
        </Card>
      ))}
    </div>
  );
}
