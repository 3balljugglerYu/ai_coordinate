"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ProfileHeader } from "./ProfileHeader";
import { UserStats } from "./UserStats";
import { UserProfilePosts } from "./UserProfilePosts";
import type { GeneratedImageRecord } from "@/features/generation/lib/database";
import type { UserProfile, UserStats as UserStatsType } from "../lib/server-api";
import { createClient } from "@/lib/supabase/client";

interface UserProfilePageProps {
  profile: UserProfile;
  stats: UserStatsType;
  posts: GeneratedImageRecord[];
  userId: string;
}

export function UserProfilePage({
  profile,
  stats,
  posts: initialPosts,
  userId,
}: UserProfilePageProps) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // 現在のユーザーIDを取得
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserId(user?.id || null);
      setIsOwnProfile(user?.id === userId);
    });
  }, [userId]);

  const handleProfileUpdate = (updatedProfile: UserProfile) => {
    // プロフィール更新後の処理（必要に応じて実装）
    router.refresh();
  };

  return (
    <>
      {/* プロフィールヘッダー */}
      <ProfileHeader
        profile={profile}
        isOwnProfile={isOwnProfile}
        onProfileUpdate={handleProfileUpdate}
      />

      {/* 統計情報 */}
      <UserStats stats={stats} />

      {/* 投稿一覧 */}
      <div>
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          {isOwnProfile ? "生成画像一覧" : "投稿画像一覧"}
        </h2>
        <UserProfilePosts
          initialPosts={initialPosts}
          userId={userId}
          isOwnProfile={isOwnProfile}
        />
      </div>
    </>
  );
}

