import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import {
  getUserProfileServer,
  getUserStatsServer,
  getUserPostsServer,
} from "../lib/server-api";
import { UserProfilePage } from "./UserProfilePage";
import { createAdminClient } from "@/lib/supabase/admin";

interface CachedUserProfileDataProps {
  profileUserId: string;
}

/**
 * 他ユーザーのプロフィール用（use cache でサーバーキャッシュ）
 * 自分のプロフィール閲覧時は使用せず、UserProfileData を使用すること
 */
export async function CachedUserProfileData({
  profileUserId,
}: CachedUserProfileDataProps) {
  "use cache";
  cacheTag(`user-profile-${profileUserId}`);
  cacheLife("minutes");

  const supabase = createAdminClient();

  const [profile, stats, posts] = await Promise.all([
    getUserProfileServer(profileUserId, supabase),
    getUserStatsServer(profileUserId, supabase),
    getUserPostsServer(profileUserId, 20, 0, supabase),
  ]);

  if (!profile || !profile.nickname) {
    notFound();
  }

  return (
    <UserProfilePage
      profile={profile}
      stats={stats}
      posts={posts}
      userId={profileUserId}
    />
  );
}
