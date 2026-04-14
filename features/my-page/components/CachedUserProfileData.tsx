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

async function getCachedUserProfileData(profileUserId: string) {
  "use cache";
  cacheTag(`user-profile-${profileUserId}`);
  cacheTag(`subscription-ui-${profileUserId}`);
  cacheLife("minutes");

  const supabase = createAdminClient();

  const [profile, stats, posts] = await Promise.all([
    getUserProfileServer(profileUserId, supabase),
    getUserStatsServer(profileUserId, supabase),
    getUserPostsServer(profileUserId, 20, 0, supabase),
  ]);

  return { profile, stats, posts };
}

/**
 * 他ユーザーのプロフィール用（データ取得のみ use cache でキャッシュ）
 * 自分のプロフィール閲覧時は使用せず、UserProfileData を使用すること
 */
export async function CachedUserProfileData({
  profileUserId,
}: CachedUserProfileDataProps) {
  const { profile, stats, posts } = await getCachedUserProfileData(profileUserId);

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
