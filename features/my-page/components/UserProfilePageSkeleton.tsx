import { Card, CardContent } from "@/components/ui/card";
import { ProfileHeaderSkeleton } from "./ProfileHeaderSkeleton";
import { UserStatsSkeleton } from "./UserStatsSkeleton";

export function UserProfilePageSkeleton() {
  return (
    <>
      {/* プロフィールヘッダースケルトン */}
      <ProfileHeaderSkeleton />

      {/* 統計情報スケルトン */}
      <UserStatsSkeleton />

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

