"use client";

import { Check, Gift } from "lucide-react";
import { cn } from "@/lib/utils";

export type StreakDayState = "completed" | "next" | "future";

interface StreakDayCardProps {
  day: number;
  amount: number;
  state: StreakDayState;
  /** タップ直後に弾みアニメ + チェックマークの pop を発火するフラグ */
  justUnlocked?: boolean;
}

export function StreakDayCard({
  day,
  amount,
  state,
  justUnlocked = false,
}: StreakDayCardProps) {
  const isCompleted = state === "completed";
  const isNext = state === "next";
  const isBigBonus = amount >= 50;

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center p-2 rounded-lg border transition-all duration-300 aspect-square",
        isCompleted
          ? "bg-purple-600 border-purple-600 text-white shadow-md"
          : isNext
            ? "bg-white border-purple-400 border-2 shadow-sm scale-105 z-10"
            : "bg-gray-50 border-gray-100 text-gray-400",
        justUnlocked && "check-in-fx-day-pop"
      )}
    >
      <span
        className={cn(
          "text-xs font-bold mb-1",
          isCompleted
            ? "text-purple-200"
            : isNext
              ? "text-purple-600"
              : "text-gray-400"
        )}
      >
        Day {day}
      </span>

      {isCompleted ? (
        <Check
          className={cn(
            "w-5 h-5 motion-reduce:animate-none",
            justUnlocked
              ? "check-in-fx-check-pop"
              : "animate-in zoom-in duration-300"
          )}
          strokeWidth={3}
        />
      ) : (
        <div className="flex flex-col items-center">
          {isBigBonus ? (
            <Gift
              className={cn(
                "w-4 h-4 mb-0.5",
                isNext ? "text-purple-500" : "text-gray-300"
              )}
            />
          ) : (
            <div
              className={cn(
                "w-3 h-3 rounded-full mb-1",
                isNext ? "bg-purple-200" : "bg-gray-200"
              )}
            />
          )}
          <span
            className={cn(
              "text-xs font-bold leading-none",
              isNext ? "text-purple-700" : ""
            )}
          >
            +{amount}
          </span>
        </div>
      )}

      {isNext && (
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500" />
        </span>
      )}
    </div>
  );
}
