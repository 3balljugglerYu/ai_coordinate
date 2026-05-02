import { cacheLife, cacheTag } from "next/cache";
import { getChallengeStatusServer } from "../lib/server-api";
import { getPercoinDefaultsForDisplay } from "@/features/credits/lib/get-percoin-defaults";
import { ChallengePageContent } from "./ChallengePageContent";
import { createAdminClient } from "@/lib/supabase/admin";

interface CachedChallengePageContentProps {
  userId: string;
  initialJstDateString: string;
}

/**
 * ミッション画面用（use cache でサーバーキャッシュ）
 * 初期表示用のチャレンジステータスをキャッシュ
 */
export async function CachedChallengePageContent({
  userId,
  initialJstDateString,
}: CachedChallengePageContentProps) {
  "use cache";
  cacheTag(`challenge-${userId}`);
  cacheTag("percoin-defaults");
  cacheLife("minutes");

  const supabase = createAdminClient();
  const status = await getChallengeStatusServer(userId, supabase);
  const [baseDefaults, displayDefaults] = await Promise.all([
    getPercoinDefaultsForDisplay("free"),
    getPercoinDefaultsForDisplay(status.subscriptionPlan),
  ]);

  return (
    <ChallengePageContent
      key={userId}
      initialChallengeStatus={status}
      initialJstDateString={initialJstDateString}
      baseDailyPostBonusAmount={baseDefaults.dailyPostBonusAmount}
      dailyPostBonusAmount={displayDefaults.dailyPostBonusAmount}
      baseStreakBonusSchedule={baseDefaults.streakBonusSchedule}
      streakBonusSchedule={displayDefaults.streakBonusSchedule}
      vercelEnv={process.env.VERCEL_ENV}
    />
  );
}
