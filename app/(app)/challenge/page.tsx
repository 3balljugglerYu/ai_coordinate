import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CachedChallengePageContent } from "@/features/challenges/components/CachedChallengePageContent";
import { ChallengeMissionCardsSkeleton } from "@/features/challenges/components/ChallengeMissionCardsSkeleton";
import { ChallengeReferralCard } from "@/features/challenges/components/ChallengeReferralCard";
import { ChallengeTopCardsSkeleton } from "@/features/challenges/components/ChallengeTopCardsSkeleton";
import { ChallengeTutorialCard } from "@/features/challenges/components/ChallengeTutorialCard";
import { getPercoinDefaultsForDisplay } from "@/features/credits/lib/get-percoin-defaults";
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
  const userPromise = requireAuth();
  const baseDefaultsPromise = getPercoinDefaultsForDisplay("free");

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

          <Suspense fallback={<ChallengeTopCardsSkeleton />}>
            <ChallengeTopCards
              userPromise={userPromise}
              copy={{
                tutorialTitle: t("tutorialTitle"),
                tutorialDescription: t("tutorialDescription"),
                tutorialCompletedTitle: t("tutorialCompletedTitle"),
                tutorialCompletedDescription: t("tutorialCompletedDescription"),
                tutorialStart: t("tutorialStart"),
              }}
            />
          </Suspense>

          <Suspense fallback={<ChallengeMissionCardsSkeleton />}>
            <ChallengeMissionSection userPromise={userPromise} />
          </Suspense>

          <Suspense fallback={<ChallengeTopCardsSkeleton />}>
            <ChallengeReferralSection
              baseDefaultsPromise={baseDefaultsPromise}
              copy={{
                referralTitle: t("referralTitle"),
                referralDescription: t("referralDescription"),
              }}
            />
          </Suspense>

          <Suspense fallback={null}>
            <ChallengeCompletedTutorialSection
              userPromise={userPromise}
              copy={{
                tutorialTitle: t("tutorialTitle"),
                tutorialDescription: t("tutorialDescription"),
                tutorialCompletedTitle: t("tutorialCompletedTitle"),
                tutorialCompletedDescription: t("tutorialCompletedDescription"),
                tutorialStart: t("tutorialStart"),
              }}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

interface ChallengeTopCardsProps {
  userPromise: ReturnType<typeof requireAuth>;
  copy: {
    tutorialTitle: string;
    tutorialDescription: string;
    tutorialCompletedTitle: string;
    tutorialCompletedDescription: string;
    tutorialStart: string;
  };
}

async function ChallengeTopCards({
  userPromise,
  copy,
}: ChallengeTopCardsProps) {
  const user = await userPromise;
  const tutorialCompleted = user.user_metadata?.tutorial_completed === true;

  if (tutorialCompleted) {
    return null;
  }

  return (
    <div className="mb-6 grid gap-6 lg:grid-cols-2">
      <ChallengeTutorialCard
        tutorialCompleted={false}
        title={copy.tutorialTitle}
        description={copy.tutorialDescription}
        completedTitle={copy.tutorialCompletedTitle}
        completedDescription={copy.tutorialCompletedDescription}
        startLabel={copy.tutorialStart}
      />
    </div>
  );
}

async function ChallengeMissionSection({
  userPromise,
}: {
  userPromise: ReturnType<typeof requireAuth>;
}) {
  const user = await userPromise;

  return <CachedChallengePageContent userId={user.id} />;
}

async function ChallengeReferralSection({
  baseDefaultsPromise,
  copy,
}: {
  baseDefaultsPromise: ReturnType<typeof getPercoinDefaultsForDisplay>;
  copy: {
    referralTitle: string;
    referralDescription: string;
  };
}) {
  const baseDefaults = await baseDefaultsPromise;

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <ChallengeReferralCard
        title={copy.referralTitle}
        description={copy.referralDescription}
        referralBonusAmount={baseDefaults.referralBonusAmount}
      />
    </div>
  );
}

async function ChallengeCompletedTutorialSection({
  userPromise,
  copy,
}: {
  userPromise: ReturnType<typeof requireAuth>;
  copy: {
    tutorialTitle: string;
    tutorialDescription: string;
    tutorialCompletedTitle: string;
    tutorialCompletedDescription: string;
    tutorialStart: string;
  };
}) {
  const user = await userPromise;
  const tutorialCompleted = user.user_metadata?.tutorial_completed === true;

  if (!tutorialCompleted) {
    return null;
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <ChallengeTutorialCard
        tutorialCompleted
        title={copy.tutorialTitle}
        description={copy.tutorialDescription}
        completedTitle={copy.tutorialCompletedTitle}
        completedDescription={copy.tutorialCompletedDescription}
        startLabel={copy.tutorialStart}
      />
    </div>
  );
}
