import { Suspense } from "react";
import { notFound } from "next/navigation";
import {
  getUserProfileServer,
  getUserStatsServer,
  getUserPostsServer,
} from "@/features/my-page/lib/server-api";
import { UserProfilePage } from "@/features/my-page/components/UserProfilePage";
import { UserProfilePageSkeleton } from "@/features/my-page/components/UserProfilePageSkeleton";

async function UserProfileData({ userId }: { userId: string }) {
  const [profile, stats, posts] = await Promise.all([
    getUserProfileServer(userId),
    getUserStatsServer(userId),
    getUserPostsServer(userId, 20, 0),
  ]);

  // プロフィールが存在しない場合は404を返す
  if (!profile || !profile.nickname) {
    notFound();
  }

  return (
    <UserProfilePage
      profile={profile}
      stats={stats}
      posts={posts}
      userId={userId}
    />
  );
}

export default async function UserProfilePageRoute({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="pt-1 pb-8 px-4">
        <div className="mx-auto max-w-6xl">
          {/* 動的コンテンツ */}
          <Suspense fallback={<UserProfilePageSkeleton />}>
            <UserProfileData userId={userId} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

