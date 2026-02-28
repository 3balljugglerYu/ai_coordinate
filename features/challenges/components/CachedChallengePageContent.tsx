import { cacheLife, cacheTag } from "next/cache";
import { getChallengeStatusServer } from "../lib/server-api";
import { getPercoinDefaultsForDisplay } from "@/features/credits/lib/get-percoin-defaults";
import { ChallengePageContent } from "./ChallengePageContent";
import { createAdminClient } from "@/lib/supabase/admin";

interface CachedChallengePageContentProps {
  userId: string;
  tutorialCompleted: boolean;
}

/**
 * ミッション画面用（use cache でサーバーキャッシュ）
 * 初期表示用のチャレンジステータスをキャッシュ
 */
export async function CachedChallengePageContent({
  userId,
  tutorialCompleted,
}: CachedChallengePageContentProps) {
  "use cache";
  cacheTag(`challenge-${userId}`);
  cacheTag("percoin-defaults");
  cacheLife("minutes");

  const supabase = createAdminClient();
  const [status, percoinDefaults] = await Promise.all([
    getChallengeStatusServer(userId, supabase),
    getPercoinDefaultsForDisplay(),
  ]);

  return (
    <ChallengePageContent
      key={userId}
      initialChallengeStatus={status}
      initialTutorialCompleted={tutorialCompleted}
      referralBonusAmount={percoinDefaults.referralBonusAmount}
      dailyPostBonusAmount={percoinDefaults.dailyPostBonusAmount}
      streakBonusSchedule={percoinDefaults.streakBonusSchedule}
    />
  );
}
