import { Suspense } from "react";
import type { Metadata } from "next";
import { ChallengePageContent } from "@/features/challenges/components/ChallengePageContent";
import { requireAuth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "チャレンジ | Persta.AI",
  description: "ミッションを達成してペルコインを獲得しよう。デイリー投稿、連続ログイン、友達紹介などの特典情報。",
};

export default async function ChallengePage() {
  await requireAuth();

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="pt-6 md:pt-8 pb-24 px-4">
        <div className="mx-auto max-w-6xl">
          {/* タイトルと説明文 */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">
              チャレンジ
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              ミッションを達成してペルコインを獲得しよう
            </p>
          </div>

          <Suspense fallback={<div className="h-screen animate-pulse bg-gray-100 rounded-lg" />}>
            <ChallengePageContent />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
