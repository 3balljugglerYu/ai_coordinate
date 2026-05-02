"use client";

import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

interface StreakGoalCardProps {
  isCompleted: boolean;
  /** タップ直後に GOAL カードを 1 回だけ祝福発光させるフラグ */
  justUnlocked?: boolean;
}

export function StreakGoalCard({
  isCompleted,
  justUnlocked = false,
}: StreakGoalCardProps) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center p-2 rounded-lg border transition-all duration-300 aspect-square",
        isCompleted
          ? "bg-yellow-400 border-yellow-500 text-white shadow-md"
          : "bg-yellow-50 border-yellow-200 text-yellow-600",
        justUnlocked && "check-in-fx-day-pop"
      )}
    >
      <span
        className={cn(
          "text-xs font-bold mb-1",
          isCompleted ? "text-yellow-100" : "text-yellow-600/70"
        )}
      >
        GOAL
      </span>
      <Trophy
        className={cn(
          "w-6 h-6 mb-1",
          isCompleted ? "text-white" : "text-yellow-500"
        )}
        strokeWidth={2}
      />

      {justUnlocked && (
        <span
          aria-hidden="true"
          className="check-in-fx-goal-glow"
        />
      )}
    </div>
  );
}
