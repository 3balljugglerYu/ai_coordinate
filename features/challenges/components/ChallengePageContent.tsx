"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  Flame,
  CalendarCheck2,
  ArrowRight,
  Check,
  Gift,
  Trophy,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { useUnreadNotificationCount } from "@/features/notifications/components/UnreadNotificationProvider";
import { useMissionDots } from "@/features/challenges/components/MissionDotProvider";
import { ChallengeCard } from "./ChallengeCard";
import type { ChallengeStatus } from "@/features/challenges/lib/api";
import {
  checkInStreakBonus,
  getChallengeStatus,
} from "@/features/challenges/lib/api";
import { cn } from "@/lib/utils";
import {
  buildMissionBonusDisplay,
  getRewardForDay,
} from "@/features/challenges/lib/subscription-bonus-display";

const jstDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatJstDate(date: Date | string) {
  return jstDateFormatter.format(typeof date === "string" ? new Date(date) : date);
}

function isSameJstDate(lastAt: string | null, now: Date = new Date()) {
  if (!lastAt) return false;
  return formatJstDate(lastAt) === formatJstDate(now);
}

interface ChallengePageContentProps {
  initialChallengeStatus?: ChallengeStatus | null;
  baseDailyPostBonusAmount: number;
  dailyPostBonusAmount: number;
  baseStreakBonusSchedule: readonly number[];
  streakBonusSchedule: readonly number[];
}

export function ChallengePageContent({
  initialChallengeStatus,
  baseDailyPostBonusAmount,
  dailyPostBonusAmount,
  baseStreakBonusSchedule,
  streakBonusSchedule,
}: ChallengePageContentProps) {
  const t = useTranslations("challenge");
  const subscriptionT = useTranslations("subscription");
  const router = useRouter();
  const { toast } = useToast();
  const { refreshUnreadCount } = useUnreadNotificationCount();
  const { refreshMissionDots, markMissionTabSnoozed } = useMissionDots();
  const maxStreakBonus = Math.max(...streakBonusSchedule);
  const totalStreakBonus = streakBonusSchedule.reduce((a, b) => a + b, 0);
  const [streakDays, setStreakDays] = useState<number>(
    initialChallengeStatus?.streakDays ?? 0
  );
  const [lastStreakLoginAt, setLastStreakLoginAt] = useState<string | null>(
    initialChallengeStatus?.lastStreakLoginAt ?? null
  );
  const [subscriptionPlan, setSubscriptionPlan] = useState<
    ChallengeStatus["subscriptionPlan"]
  >(initialChallengeStatus?.subscriptionPlan ?? "free");
  const [isCheckedInToday, setIsCheckedInToday] = useState<boolean>(
    initialChallengeStatus
      ? isSameJstDate(initialChallengeStatus.lastStreakLoginAt)
      : false
  );
  const [isCheckingIn, setIsCheckingIn] = useState<boolean>(false);
  const [isDailyBonusReceived, setIsDailyBonusReceived] = useState<boolean>(
    initialChallengeStatus?.lastDailyPostBonusAt
      ? isSameJstDate(initialChallengeStatus.lastDailyPostBonusAt)
      : false
  );
  const [timeToReset, setTimeToReset] = useState<string>("");
  const bonusDisplay = buildMissionBonusDisplay({
    subscriptionPlan,
    baseDailyPostBonusAmount,
    dailyPostBonusAmount,
    baseStreakBonusSchedule,
    streakBonusSchedule,
  });
  const planAccentClasses = {
    free: {
      card: "",
      badge: "",
      panel: "",
      text: "",
    },
    light: {
      card:
        "border-amber-200/80 bg-gradient-to-br from-amber-50/70 via-white to-white shadow-[0_24px_48px_-36px_rgba(245,158,11,0.45)]",
      badge:
        "border-amber-200 bg-amber-50 text-amber-700 shadow-sm",
      panel:
        "border-amber-200/80 bg-amber-50/80 text-amber-900",
      text: "text-amber-700",
    },
    standard: {
      card:
        "border-sky-200/80 bg-gradient-to-br from-sky-50/75 via-white to-white shadow-[0_24px_48px_-36px_rgba(14,165,233,0.4)]",
      badge:
        "border-sky-200 bg-sky-50 text-sky-700 shadow-sm",
      panel:
        "border-sky-200/80 bg-sky-50/80 text-sky-900",
      text: "text-sky-700",
    },
    premium: {
      card:
        "border-emerald-200/80 bg-gradient-to-br from-emerald-50/80 via-white to-white shadow-[0_24px_48px_-36px_rgba(16,185,129,0.45)]",
      badge:
        "border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm",
      panel:
        "border-emerald-200/80 bg-emerald-50/80 text-emerald-900",
      text: "text-emerald-700",
    },
  } as const;
  const accent = planAccentClasses[subscriptionPlan];
  const getPaidPlanBadgeLabel = (
    plan: "light" | "standard" | "premium"
  ) => {
    if (plan === "light") return subscriptionT("badge.light");
    if (plan === "standard") return subscriptionT("badge.standard");
    return subscriptionT("badge.premium");
  };
  const planBadgeLabel = bonusDisplay.hasBoostedRewards
    ? getPaidPlanBadgeLabel(subscriptionPlan as "light" | "standard" | "premium")
    : null;
  const missionBoostBadge = bonusDisplay.hasBoostedRewards ? (
    <Badge variant="outline" className={cn("gap-1.5 px-2.5 py-1", accent.badge)}>
      <Sparkles className="h-3.5 w-3.5" />
      {t("boostBadge", { multiplier: bonusDisplay.multiplierLabel })}
    </Badge>
  ) : undefined;

  const refreshChallengeStatus = useCallback(async () => {
    try {
      const status = await getChallengeStatus();
      setStreakDays(status.streakDays);
      setLastStreakLoginAt(status.lastStreakLoginAt);
      setSubscriptionPlan(status.subscriptionPlan);
      setIsCheckedInToday(isSameJstDate(status.lastStreakLoginAt));
      setIsDailyBonusReceived(isSameJstDate(status.lastDailyPostBonusAt));
    } catch (error) {
      console.error("Failed to fetch challenge status:", error);
    }
  }, []);

  // アカウント切り替え時に Router Cache が古いデータを返す場合があるため、常に最新データを取得
  useEffect(() => {
    void refreshChallengeStatus();

    const intervalId = window.setInterval(() => {
      void refreshChallengeStatus();
    }, 60_000);
    const handleFocus = () => {
      void refreshChallengeStatus();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
    };
  }, [refreshChallengeStatus]);

  // ミッションページ表示中はナビのバッジを楽観的に消す（URL 直アクセス時も含む）
  useEffect(() => {
    markMissionTabSnoozed();
  }, [markMissionTabSnoozed]);

  useEffect(() => {
    // カウントダウンタイマー（JST 0:00 = UTC 15:00 まで）
    const updateTimer = () => {
      const now = new Date();
      const target = new Date(now);

      // JST 0時は UTC 15時
      target.setUTCHours(15, 0, 0, 0);

      // もし現在時刻が15時を過ぎていれば、ターゲットは翌日の15時
      if (target <= now) {
        target.setUTCDate(target.getUTCDate() + 1);
      }

      const diff = target.getTime() - now.getTime();

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeToReset(
        `${hours.toString().padStart(2, "0")}:${minutes
          .toString()
          .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
      );
      setIsCheckedInToday(isSameJstDate(lastStreakLoginAt, now));
    };

    updateTimer();
    const intervalId = setInterval(updateTimer, 1000);

    return () => clearInterval(intervalId);
  }, [lastStreakLoginAt]);

  const handleCheckIn = async () => {
    if (isCheckingIn || isCheckedInToday) return;

    setIsCheckingIn(true);
    try {
      const result = await checkInStreakBonus({
        checkInFailed: t("checkInFailedDescription"),
      });

      if (result.streak_days !== null) {
        setStreakDays(result.streak_days);
      }
      setIsCheckedInToday(result.checked_in_today);
      setLastStreakLoginAt(result.last_streak_login_at);

      if (result.bonus_granted > 0) {
        const streakDayForMessage = result.streak_days ?? streakDays;
        const baseRewardForMessage =
          getRewardForDay(baseStreakBonusSchedule, streakDayForMessage) ?? 0;
        const hasBoostedCheckInReward =
          bonusDisplay.hasBoostedRewards &&
          baseRewardForMessage > 0 &&
          result.bonus_granted > baseRewardForMessage;
        const description =
          streakDayForMessage > 0
            ? t("checkInSuccessWithStreak", {
                days: streakDayForMessage,
                bonus: result.bonus_granted,
              })
            : t("checkInSuccessWithoutStreak", {
                bonus: result.bonus_granted,
              });

        toast({
          title: t("checkInSuccessTitle"),
          description: hasBoostedCheckInReward && planBadgeLabel ? (
            <div className="space-y-2">
              <p>{description}</p>
              <div className={cn("flex flex-wrap items-center gap-2 text-xs font-medium", accent.text)}>
                <Badge variant="outline" className={cn("gap-1.5 px-2 py-0.5", accent.badge)}>
                  <Sparkles className="h-3.5 w-3.5" />
                  {t("boostBadge", { multiplier: bonusDisplay.multiplierLabel })}
                </Badge>
              </div>
            </div>
          ) : description,
          variant: "default",
        });
        // チェックイン成功時に未読バッジを即時更新
        await refreshUnreadCount();
      }

      await refreshMissionDots();
      // ペルコイン残高の即時反映
      router.refresh();
    } catch (error) {
      console.error("Failed to check in streak bonus:", error);
      toast({
        title: t("checkInFailedTitle"),
        description: t("checkInFailedDescription"),
        variant: "destructive",
      });
    } finally {
      setIsCheckingIn(false);
    }
  };

  return (
    <div className="animate-in fade-in duration-500 motion-reduce:animate-none">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="mb-6">
          <ChallengeCard
            title={t("streakTitle")}
            description={t("streakDescription", { totalBonus: totalStreakBonus })}
            percoinText={t("streakRewardText", { amount: maxStreakBonus })}
            headerBadge={missionBoostBadge}
            icon={Flame}
            color="purple"
            className={cn("h-full", bonusDisplay.hasBoostedRewards && accent.card)}
          >
            <div className="mt-4">
              {bonusDisplay.hasBoostedRewards && planBadgeLabel && (
                <div className={cn("mb-4 rounded-2xl border p-3", accent.panel)}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold tracking-wide">
                        {t("streakBoostLabel", { plan: planBadgeLabel })}
                      </div>
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="text-muted-foreground line-through">
                          +{bonusDisplay.streak.baseMax}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5" />
                        <span className="font-bold">
                          +{bonusDisplay.streak.boostedMax}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] font-semibold tracking-wide">
                        {t("streakBoostTotalLabel")}
                      </div>
                      <div className="text-sm font-bold">
                        {t("boostComparisonCompact", {
                          base: bonusDisplay.streak.baseTotal,
                          boosted: bonusDisplay.streak.boostedTotal,
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-purple-900 bg-purple-50 px-3 py-1 rounded-full">
                  {t("streakCurrent", { days: streakDays })}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("streakRemaining", {
                    days: Math.max(streakBonusSchedule.length - streakDays, 0),
                  })}
                </span>
              </div>

              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="relative inline-flex">
                  <Button
                    type="button"
                    className="min-h-11"
                    onClick={handleCheckIn}
                    disabled={isCheckingIn || isCheckedInToday}
                  >
                    {isCheckingIn && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isCheckedInToday
                      ? t("checkedIn")
                      : isCheckingIn
                        ? t("checkingIn")
                        : t("checkIn")}
                  </Button>
                  {!isCheckedInToday && !isCheckingIn && (
                    <span className="pointer-events-none absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500" />
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{t("resetAtJst")}</span>
                </div>
              </div>

              {/* 5列x3行のグリッド (ストリーク日数 + ゴール) */}
              <div className="grid grid-cols-5 gap-2">
                {streakBonusSchedule.map((amount, index) => {
                  const day = index + 1;
                  const isCompleted = day <= streakDays;
                  const isNext = day === streakDays + 1;
                  const isBigBonus = amount >= 50;

                  return (
                    <div
                      key={day}
                      className={cn(
                        "relative flex flex-col items-center justify-center p-2 rounded-lg border transition-all duration-300 aspect-square",
                        isCompleted
                          ? "bg-purple-600 border-purple-600 text-white shadow-md"
                          : isNext
                            ? "bg-white border-purple-400 border-2 shadow-sm scale-105 z-10"
                            : "bg-gray-50 border-gray-100 text-gray-400"
                      )}
                    >
                      <span className={cn(
                        "text-xs font-bold mb-1",
                        isCompleted ? "text-purple-200" : isNext ? "text-purple-600" : "text-gray-400"
                      )}>
                        Day {day}
                      </span>

                      {isCompleted ? (
                        <Check className="w-5 h-5 animate-in zoom-in duration-300 motion-reduce:animate-none" strokeWidth={3} />
                      ) : (
                        <div className="flex flex-col items-center">
                          {isBigBonus ? (
                            <Gift className={cn("w-4 h-4 mb-0.5", isNext ? "text-purple-500" : "text-gray-300")} />
                          ) : (
                            <div className={cn("w-3 h-3 rounded-full mb-1", isNext ? "bg-purple-200" : "bg-gray-200")} />
                          )}
                          <span className={cn("text-xs font-bold leading-none", isNext ? "text-purple-700" : "")}>
                            +{amount}
                          </span>
                        </div>
                      )}

                      {isNext && (
                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                          <span className="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
                        </span>
                      )}
                    </div>
                  );
                })}

                {/* ゴールマス */}
                <div className={cn(
                  "relative flex flex-col items-center justify-center p-2 rounded-lg border transition-all duration-300 aspect-square",
                  // ストリーク日数達成済みならゴールも達成扱い
                  streakDays >= streakBonusSchedule.length
                    ? "bg-yellow-400 border-yellow-500 text-white shadow-md"
                    : "bg-yellow-50 border-yellow-200 text-yellow-600"
                )}>
                  <span className={cn(
                    "text-xs font-bold mb-1",
                    streakDays >= streakBonusSchedule.length ? "text-yellow-100" : "text-yellow-600/70"
                  )}>
                    GOAL
                  </span>
                  <Trophy className={cn(
                    "w-6 h-6 mb-1",
                    streakDays >= streakBonusSchedule.length ? "text-white animate-bounce" : "text-yellow-500"
                  )} strokeWidth={2} />

                  {streakDays >= streakBonusSchedule.length && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-lg bg-yellow-400 opacity-20"></span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </ChallengeCard>
        </div>

        <div className="relative mb-6">
          {!isDailyBonusReceived && (
            <span className="pointer-events-none absolute -top-1 -right-1 z-10 h-2.5 w-2.5 rounded-full bg-red-500" />
          )}
          <ChallengeCard
            title={t("dailyTitle")}
            description={t("dailyDescription")}
            percoinAmount={dailyPostBonusAmount}
            headerBadge={missionBoostBadge}
            icon={CalendarCheck2}
            color="blue"
            className={cn("h-full", bonusDisplay.hasBoostedRewards && accent.card)}
          >
            <div className="space-y-4">
              {bonusDisplay.hasBoostedRewards && planBadgeLabel && (
                <div className={cn("rounded-2xl border p-3", accent.panel)}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold tracking-wide">
                        {t("dailyBoostLabel", { plan: planBadgeLabel })}
                      </div>
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="text-muted-foreground line-through">
                          +{bonusDisplay.daily.base}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5" />
                        <span className="font-bold">
                          +{bonusDisplay.daily.boosted}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] font-semibold tracking-wide">
                        {t("boostBadge", {
                          multiplier: bonusDisplay.multiplierLabel,
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {/* ステータス表示 */}
              <div className={cn(
                "flex items-center justify-between p-4 rounded-lg border transition-colors",
                isDailyBonusReceived
                  ? "bg-green-50 border-green-200"
                  : "bg-gray-50 border-gray-100"
              )}>
                <div className="flex items-center gap-3">
                  {isDailyBonusReceived ? (
                    <div className="bg-green-100 p-2 rounded-full">
                      <CheckCircle2 className="w-6 h-6 text-green-600" />
                    </div>
                  ) : (
                    <div className="bg-gray-200 p-2 rounded-full">
                      <XCircle className="w-6 h-6 text-gray-500" />
                    </div>
                  )}
                  <div>
                    <div className={cn(
                      "font-bold",
                      isDailyBonusReceived ? "text-green-800" : "text-gray-700"
                    )}>
                      {isDailyBonusReceived
                        ? t("dailyReceivedTitle")
                        : t("dailyPendingTitle")}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {isDailyBonusReceived
                        ? t("dailyReceivedDescription")
                        : t("dailyPendingDescription", {
                            amount: dailyPostBonusAmount,
                          })}
                    </div>
                  </div>
                </div>

                {isDailyBonusReceived && (
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground mb-1">{t("resetIn")}</div>
                    <div className="flex items-center justify-end gap-1.5 font-mono text-lg font-bold text-green-700">
                      <Clock className="w-4 h-4" />
                      {timeToReset}
                    </div>
                  </div>
                )}
              </div>

              {!isDailyBonusReceived && (
                <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{t("resetIn")} {timeToReset}</span>
                </div>
              )}

              <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                <span className="font-bold shrink-0">{t("tipsLabel")}</span>
                <span>{t("dailyResetDescription")}</span>
              </div>
            </div>
          </ChallengeCard>
        </div>
      </div>
    </div>
  );
}
