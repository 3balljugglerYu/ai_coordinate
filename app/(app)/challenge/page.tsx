import { Suspense } from "react";
import type { Metadata } from "next";
import { CachedChallengePageContent } from "@/features/challenges/components/CachedChallengePageContent";
import { requireAuth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "ミッション | Persta.AI",
  description: "ミッションを達成してペルコインを獲得しよう。デイリー投稿、連続ログイン、友達紹介などの特典情報。",
};

export default async function ChallengePage() {
  const user = await requireAuth();
  const tutorialCompleted = user.user_metadata?.tutorial_completed === true;

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="pt-6 md:pt-8 pb-24 px-4">
        <div className="mx-auto max-w-6xl">
          {/* タイトルと説明文 */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">
              ミッション
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              ミッションを達成してペルコインを獲得しよう
            </p>
          </div>

          <Suspense fallback={<div className="h-screen animate-pulse bg-gray-100 rounded-lg" />}>
            <CachedChallengePageContent
              userId={user.id}
              tutorialCompleted={tutorialCompleted}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
