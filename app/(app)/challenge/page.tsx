import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CachedChallengePageContent } from "@/features/challenges/components/CachedChallengePageContent";
import { requireAuth } from "@/lib/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("challenge");

  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function ChallengePage() {
  const t = await getTranslations("challenge");
  const user = await requireAuth();
  const tutorialCompleted = user.user_metadata?.tutorial_completed === true;

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="pt-6 md:pt-8 pb-24 px-4">
        <div className="mx-auto max-w-6xl">
          {/* タイトルと説明文 */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">
              {t("pageTitle")}
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              {t("pageDescription")}
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
