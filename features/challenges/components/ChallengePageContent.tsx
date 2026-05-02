"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Flame,
  CalendarCheck2,
  ArrowRight,
  Clock,
  CheckCircle2,
  ImagePlus,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { useUnreadNotificationCount } from "@/features/notifications/components/UnreadNotificationProvider";
import { useMissionDots } from "@/features/challenges/components/MissionDotProvider";
import { ChallengeCard } from "./ChallengeCard";
import { CheckInButton } from "./CheckInButton";
import { RedPulseDot } from "./RedPulseDot";
import { StreakDayCard } from "./StreakDayCard";
import { StreakGoalCard } from "./StreakGoalCard";
import type { RewardTier } from "./RewardBurst";
import type {
  ChallengeStatus,
  CheckInStreakBonusResponse,
} from "@/features/challenges/lib/api";
import { checkInStreakBonus } from "@/features/challenges/lib/api";
import { cn } from "@/lib/utils";
import {
  buildMissionBonusDisplay,
  getRewardForDay,
} from "@/features/challenges/lib/subscription-bonus-display";
import {
  isSameJstDate,
  isSameJstDateString,
  isStreakBroken,
} from "@/features/challenges/lib/streak-utils";

interface OptimisticOverride {
  streakDays: number;
  isCheckedInToday: boolean;
  lastStreakLoginAt: string | null;
  /** タップ直後に弾みアニメ + 祝福発光を発火するマス番号（1〜14） */
  justUnlockedDay: number;
}

interface ChallengePageContentProps {
  initialChallengeStatus?: ChallengeStatus | null;
  initialJstDateString: string;
  baseDailyPostBonusAmount: number;
  dailyPostBonusAmount: number;
  baseStreakBonusSchedule: readonly number[];
  streakBonusSchedule: readonly number[];
  /**
   * Vercel が自動で設定する VERCEL_ENV ("production" | "preview" | "development" | undefined)。
   * preview_streak URL パラメータの本番セーフガード判定に使用する。
   */
  vercelEnv?: string;
}

export function ChallengePageContent({
  initialChallengeStatus,
  initialJstDateString,
  baseDailyPostBonusAmount,
  dailyPostBonusAmount,
  baseStreakBonusSchedule,
  streakBonusSchedule,
  vercelEnv,
}: ChallengePageContentProps) {
  const t = useTranslations("challenge");
  const subscriptionT = useTranslations("subscription");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { refreshUnreadCount } = useUnreadNotificationCount();
  const {
    missionStatus,
    hasCheckInDot,
    hasDailyPostDot,
    refreshMissionDots,
    markMissionTabSnoozed,
  } = useMissionDots();
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
      ? isSameJstDateString(
          initialChallengeStatus.lastStreakLoginAt,
          initialJstDateString
        )
      : false
  );
  const [optimisticOverride, setOptimisticOverride] =
    useState<OptimisticOverride | null>(null);
  const apiResolvedRef = useRef(false);
  const timelineDoneRef = useRef(false);
  const [isDailyBonusReceived, setIsDailyBonusReceived] = useState<boolean>(
    initialChallengeStatus?.lastDailyPostBonusAt
      ? isSameJstDateString(
          initialChallengeStatus.lastDailyPostBonusAt,
          initialJstDateString
        )
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

  useEffect(() => {
    if (!missionStatus) return;
    setStreakDays(missionStatus.streakDays);
    setLastStreakLoginAt(missionStatus.lastStreakLoginAt);
    setSubscriptionPlan(missionStatus.subscriptionPlan);
    setIsCheckedInToday(!hasCheckInDot);
    setIsDailyBonusReceived(!hasDailyPostDot);
  }, [hasCheckInDot, hasDailyPostDot, missionStatus]);

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

  // ===== preview_streak URL パラメータ =====
  // /challenge?preview_streak=N  (N = 1..14) で UI 演出を擬似再生する開発用モード。
  // - 表示の streak を N-1 に固定 → ボタン押下で N 日目達成の演出が完走
  // - チェックイン API は呼ばず、モック結果でアニメだけ流す（DB に影響なし）
  // - 本番（NODE_ENV=production && VERCEL_ENV=production）では問答無用で無視
  const previewStreakRaw = searchParams.get("preview_streak");
  const previewStreak = useMemo<number | null>(() => {
    if (!previewStreakRaw) return null;
    const isProduction =
      process.env.NODE_ENV === "production" && vercelEnv === "production";
    if (isProduction) return null;
    const n = Number.parseInt(previewStreakRaw, 10);
    if (
      !Number.isInteger(n) ||
      n < 1 ||
      n > streakBonusSchedule.length
    ) {
      return null;
    }
    return n;
  }, [previewStreakRaw, vercelEnv, streakBonusSchedule.length]);
  const isPreviewMode = previewStreak !== null;

  // 本番で preview_streak を付けてアクセスされた場合のログ出力（ユーザー要件）
  useEffect(() => {
    if (!previewStreakRaw) return;
    const isProduction =
      process.env.NODE_ENV === "production" && vercelEnv === "production";
    if (isProduction) {
      console.warn(
        "[challenge] preview_streak parameter is disabled in production environment"
      );
    }
  }, [previewStreakRaw, vercelEnv]);

  // preview_streak の値が変わったら override を必ずリセット（連打 / 値変更時の整合性確保）。
  // URL パラメータという外部入力への同期なので useEffect が正しい場所
  // （既存の missionStatus 同期と同じパターン）
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOptimisticOverride(null);
    apiResolvedRef.current = false;
    timelineDoneRef.current = false;
  }, [previewStreak]);

  // preview モードでは「実体の base state」を効果的に上書きする値を用意
  const effectiveStreakDays = isPreviewMode ? previewStreak - 1 : streakDays;
  const effectiveIsCheckedInToday = isPreviewMode ? false : isCheckedInToday;
  const effectiveLastStreakLoginAt = isPreviewMode ? null : lastStreakLoginAt;

  // 表示用にマージしたストリーク状態（楽観的演出中は override が優先される）
  const displayStreakDays = optimisticOverride?.streakDays ?? effectiveStreakDays;
  const displayIsCheckedInToday =
    optimisticOverride?.isCheckedInToday ?? effectiveIsCheckedInToday;
  const justUnlockedDay = optimisticOverride?.justUnlockedDay ?? null;

  // タップ時の期待値（API 結果が来る前の楽観的予測）
  // preview モードでは URL の N をそのまま採用する
  const isStreakBrokenNow = isStreakBroken(effectiveLastStreakLoginAt);
  const expectedNextStreakDay = isPreviewMode
    ? previewStreak
    : effectiveIsCheckedInToday
      ? effectiveStreakDays
      : isStreakBrokenNow || effectiveStreakDays >= streakBonusSchedule.length
        ? 1
        : effectiveStreakDays + 1;
  const expectedAmount =
    streakBonusSchedule[Math.max(0, expectedNextStreakDay - 1)] ?? 10;
  const expectedTier: RewardTier =
    expectedNextStreakDay === streakBonusSchedule.length
      ? "goal"
      : expectedAmount >= 50
        ? "bonus"
        : "normal";

  const tryDismissOptimistic = () => {
    // preview モードでは override を維持し続ける（base state を更新しないため）
    if (isPreviewMode) return;
    if (apiResolvedRef.current && timelineDoneRef.current) {
      setOptimisticOverride(null);
      apiResolvedRef.current = false;
      timelineDoneRef.current = false;
    }
  };

  const handleCheckInApi = async (): Promise<CheckInStreakBonusResponse> => {
    apiResolvedRef.current = false;
    timelineDoneRef.current = false;
    if (isPreviewMode) {
      // モック: 通信なしで成功レスポンスを返す（300ms 待機して "API 風" にする）
      await new Promise((resolve) => setTimeout(resolve, 300));
      const bonus = streakBonusSchedule[previewStreak - 1] ?? 0;
      return {
        bonus_granted: bonus,
        streak_days: previewStreak,
        checked_in_today: true,
        last_streak_login_at: new Date().toISOString(),
      };
    }
    return checkInStreakBonus({
      checkInFailed: t("checkInFailedDescription"),
    });
  };

  const handleOptimisticDayPop = () => {
    setOptimisticOverride((prev) => ({
      streakDays: prev?.streakDays ?? effectiveStreakDays,
      isCheckedInToday:
        prev?.isCheckedInToday ?? effectiveIsCheckedInToday,
      lastStreakLoginAt:
        prev?.lastStreakLoginAt ?? effectiveLastStreakLoginAt,
      justUnlockedDay: expectedNextStreakDay,
    }));
  };

  const handleOptimisticStreakAdvance = () => {
    setOptimisticOverride((prev) => ({
      streakDays: expectedNextStreakDay,
      isCheckedInToday: true,
      lastStreakLoginAt: new Date().toISOString(),
      justUnlockedDay: prev?.justUnlockedDay ?? expectedNextStreakDay,
    }));
  };

  const handleCheckInSuccess = async (result: CheckInStreakBonusResponse) => {
    // preview モードでは base state も副作用 (refresh*) も触らず、トーストのみ
    if (isPreviewMode) {
      if (result.bonus_granted > 0) {
        const streakDayForMessage =
          result.streak_days ?? expectedNextStreakDay;
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
          description,
          variant: "default",
        });
      }
      // override は維持（dismiss しない: tryDismissOptimistic も no-op）
      apiResolvedRef.current = true;
      return;
    }

    // 実値で base state を正規化
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
        description:
          hasBoostedCheckInReward && planBadgeLabel ? (
            <div className="space-y-2">
              <p>{description}</p>
              <div
                className={cn(
                  "flex flex-wrap items-center gap-2 text-xs font-medium",
                  accent.text
                )}
              >
                <Badge
                  variant="outline"
                  className={cn("gap-1.5 px-2 py-0.5", accent.badge)}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {t("boostBadge", { multiplier: bonusDisplay.multiplierLabel })}
                </Badge>
              </div>
            </div>
          ) : (
            description
          ),
        variant: "default",
      });
      // チェックイン成功時に未読バッジを即時更新
      await refreshUnreadCount();
    }

    await refreshMissionDots();
    // ペルコイン残高の即時反映
    router.refresh();

    // タイムラインの done と合流したら override を解除
    apiResolvedRef.current = true;
    tryDismissOptimistic();
  };

  const handleCheckInError = (error: unknown) => {
    console.error("Failed to check in streak bonus:", error);
    toast({
      title: t("checkInFailedTitle"),
      description: t("checkInFailedDescription"),
      variant: "destructive",
    });
    // 楽観的更新を即座に revert
    apiResolvedRef.current = false;
    timelineDoneRef.current = false;
    setOptimisticOverride(null);
  };

  const handleTimelineDone = () => {
    timelineDoneRef.current = true;
    tryDismissOptimistic();
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
                  {t("streakCurrent", { days: displayStreakDays })}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("streakRemaining", {
                    days: Math.max(
                      streakBonusSchedule.length - displayStreakDays,
                      0
                    ),
                  })}
                </span>
              </div>

              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <CheckInButton
                  isCheckedInToday={displayIsCheckedInToday}
                  expectedAmount={expectedAmount}
                  expectedTier={expectedTier}
                  onCheckIn={handleCheckInApi}
                  onOptimisticDayPop={handleOptimisticDayPop}
                  onOptimisticStreakAdvance={handleOptimisticStreakAdvance}
                  onSuccess={handleCheckInSuccess}
                  onError={handleCheckInError}
                  onTimelineDone={handleTimelineDone}
                />
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{t("resetAtJst")}</span>
                </div>
              </div>

              {/* 5列x3行のグリッド (ストリーク日数 + ゴール) */}
              <div className="grid grid-cols-5 gap-2">
                {streakBonusSchedule.map((amount, index) => {
                  const day = index + 1;
                  const state =
                    day <= displayStreakDays
                      ? "completed"
                      : day === displayStreakDays + 1
                        ? "next"
                        : "future";
                  return (
                    <StreakDayCard
                      key={day}
                      day={day}
                      amount={amount}
                      state={state}
                      justUnlocked={justUnlockedDay === day}
                    />
                  );
                })}

                <StreakGoalCard
                  isCompleted={displayStreakDays >= streakBonusSchedule.length}
                  justUnlocked={
                    justUnlockedDay === streakBonusSchedule.length
                  }
                />
              </div>
            </div>
          </ChallengeCard>
        </div>

        <div className="mb-6">
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
                "relative flex items-center justify-between rounded-lg border p-4 transition-colors",
                isDailyBonusReceived
                  ? "bg-green-50 border-green-200"
                  : "border-blue-200/80 bg-blue-50/80 pr-7"
              )}>
                {!isDailyBonusReceived && <RedPulseDot />}
                <div className="flex items-center gap-3">
                  {isDailyBonusReceived ? (
                    <div className="shrink-0 rounded-full bg-green-100 p-2">
                      <CheckCircle2 className="w-6 h-6 text-green-600" />
                    </div>
                  ) : (
                    <div className="shrink-0 rounded-full bg-blue-100 p-2">
                      <ImagePlus className="w-6 h-6 text-blue-600" />
                    </div>
                  )}
                  <div>
                    <div className={cn(
                      "font-bold",
                      isDailyBonusReceived ? "text-green-800" : "text-blue-900"
                    )}>
                      {isDailyBonusReceived
                        ? t("dailyReceivedTitle")
                        : t("dailyPendingTitle")}
                    </div>
                    <div
                      className={cn(
                        "mt-0.5 text-xs",
                        isDailyBonusReceived
                          ? "text-muted-foreground"
                          : "text-blue-700"
                      )}
                    >
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
