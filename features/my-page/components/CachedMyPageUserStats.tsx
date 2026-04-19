import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserStatsServer } from "../lib/server-api";
import { UserStats } from "./UserStats";

interface CachedMyPageUserStatsProps {
  userId: string;
}

export async function CachedMyPageUserStats({
  userId,
}: CachedMyPageUserStatsProps) {
  "use cache";
  cacheTag(`my-page-${userId}`);
  cacheLife("minutes");

  const supabase = createAdminClient();
  const stats = await getUserStatsServer(userId, supabase, { isOwnProfile: true });

  return <UserStats stats={stats} />;
}
