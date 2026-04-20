import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfileServer } from "../lib/server-api";
import { ProfileHeader } from "./ProfileHeader";

interface CachedMyPageProfileHeaderProps {
  userId: string;
}

export async function CachedMyPageProfileHeader({
  userId,
}: CachedMyPageProfileHeaderProps) {
  "use cache";
  cacheTag(`my-page-${userId}`);
  cacheTag(`subscription-ui-${userId}`);
  cacheLife("minutes");

  const supabase = createAdminClient();
  const profile = await getUserProfileServer(userId, supabase);

  return (
    <ProfileHeader
      key={userId}
      profile={profile}
      isOwnProfile
      userId={userId}
      currentUserId={userId}
    />
  );
}
