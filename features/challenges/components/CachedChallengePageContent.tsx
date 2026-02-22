import { cacheLife, cacheTag } from "next/cache";
import { getChallengeStatusServer } from "../lib/server-api";
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
  cacheLife("minutes");

  const supabase = createAdminClient();
  const status = await getChallengeStatusServer(userId, supabase);

  return (
    <ChallengePageContent
      key={userId}
      initialChallengeStatus={status}
      initialTutorialCompleted={tutorialCompleted}
    />
  );
}
