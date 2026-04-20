"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChallengeCard } from "./ChallengeCard";
import { TUTORIAL_STORAGE_KEYS } from "@/features/tutorial/types";

interface ChallengeTutorialCardProps {
  tutorialCompleted: boolean;
  title: string;
  description: string;
  completedTitle: string;
  completedDescription: string;
  startLabel: string;
}

export function ChallengeTutorialCard({
  tutorialCompleted,
  title,
  description,
  completedTitle,
  completedDescription,
  startLabel,
}: ChallengeTutorialCardProps) {
  const router = useRouter();

  return (
    <ChallengeCard
      title={title}
      description={description}
      icon={PlayCircle}
      color="green"
      className={tutorialCompleted ? "opacity-75" : undefined}
    >
      <div className="mt-4">
        {tutorialCompleted ? (
          <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="shrink-0 rounded-full bg-green-100 p-2">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <div className="font-bold text-green-800">{completedTitle}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {completedDescription}
              </div>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            className="min-h-11 w-full"
            onClick={() => {
              if (typeof localStorage !== "undefined") {
                localStorage.removeItem(TUTORIAL_STORAGE_KEYS.DECLINED);
              }
              router.push("/");
            }}
          >
            <PlayCircle className="mr-2 h-4 w-4" />
            {startLabel}
          </Button>
        )}
      </div>
    </ChallengeCard>
  );
}
