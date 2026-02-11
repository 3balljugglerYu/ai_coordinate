"use client";

import { useEffect, useState } from "react";
import Masonry from "react-masonry-css";
import {
  Users,
  Flame,
  CalendarCheck2,
  Check,
  Gift,
  Trophy,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { ChallengeCard } from "./ChallengeCard";
import { ReferralCodeDisplay } from "@/features/referral/components/ReferralCodeDisplay";
import {
  REFERRAL_BONUS_AMOUNT,
  DAILY_POST_BONUS_AMOUNT,
  STREAK_BONUS_SCHEDULE,
} from "@/constants";
import {
  checkInStreakBonus,
  getChallengeStatus,
} from "@/features/challenges/lib/api";
import { cn } from "@/lib/utils";

const breakpointColumnsObj = {
  default: 3,
  1024: 2,
  640: 1,
};

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

export function ChallengePageContent() {
  const { toast } = useToast();
  const maxStreakBonus = Math.max(...STREAK_BONUS_SCHEDULE);
  const totalStreakBonus = STREAK_BONUS_SCHEDULE.reduce((a, b) => a + b, 0);
  const [streakDays, setStreakDays] = useState<number>(0);
  const [lastStreakLoginAt, setLastStreakLoginAt] = useState<string | null>(null);
  const [isCheckedInToday, setIsCheckedInToday] = useState<boolean>(false);
  const [isCheckingIn, setIsCheckingIn] = useState<boolean>(false);
  const [isDailyBonusReceived, setIsDailyBonusReceived] = useState<boolean>(false);
  const [timeToReset, setTimeToReset] = useState<string>("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const status = await getChallengeStatus();
        setStreakDays(status.streakDays);
        setLastStreakLoginAt(status.lastStreakLoginAt);
        setIsCheckedInToday(isSameJstDate(status.lastStreakLoginAt));

        // デイリーボーナス取得状況の判定（JST基準）
        if (status.lastDailyPostBonusAt) {
          setIsDailyBonusReceived(isSameJstDate(status.lastDailyPostBonusAt));
        } else {
          setIsDailyBonusReceived(false);
        }
      } catch (error) {
        console.error("Failed to fetch challenge status:", error);
      }
    };

    fetchData();
  }, []);

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
      const result = await checkInStreakBonus();

      if (result.streak_days !== null) {
        setStreakDays(result.streak_days);
      }
      setIsCheckedInToday(result.checked_in_today);
      setLastStreakLoginAt(result.last_streak_login_at);

      if (result.bonus_granted > 0) {
        const streakDayForMessage = result.streak_days ?? streakDays;
        const description =
          streakDayForMessage > 0
            ? `${streakDayForMessage}日連続ログインで${result.bonus_granted}ペルコインを獲得しました！`
            : `ログインボーナスとして${result.bonus_granted}ペルコインを獲得しました！`;

        toast({
          title: "連続ログイン特典ボーナス！",
          description,
          variant: "default",
        });
      }
    } catch (error) {
      console.error("Failed to check in streak bonus:", error);
      toast({
        title: "チェックインに失敗しました",
        description: "時間をおいて再度お試しください。",
        variant: "destructive",
      });
    } finally {
      setIsCheckingIn(false);
    }
  };

  return (
    <div className="animate-in fade-in duration-500">
      <Masonry
        breakpointCols={breakpointColumnsObj}
        className="flex w-auto -ml-6"
        columnClassName="pl-6 bg-clip-padding"
      >
        {/* 1. リファラル特典 */}
        <div className="mb-6">
          <ChallengeCard
            title="友達紹介特典"
            description="友達を招待してペルコインをゲット！紹介リンクまたはQRコードから友達が新規登録すると特典が付与されます。"
            percoinAmount={REFERRAL_BONUS_AMOUNT}
            icon={Users}
            color="orange"
            className="h-full"
          >
            <ReferralCodeDisplay />
          </ChallengeCard>
        </div>

        {/* 2. ストリーク特典 */}
        <div className="mb-6">
          <ChallengeCard
            title="連続ログインボーナス"
            description={`毎日チェックインしてボーナスをゲット！2週間継続すると合計${totalStreakBonus}ペルコインが獲得できます。`}
            percoinText={`最大 +${maxStreakBonus}`}
            icon={Flame}
            color="purple"
            className="h-full"
          >
            <div className="mt-4">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-purple-900 bg-purple-50 px-3 py-1 rounded-full">
                  現在の連続記録: <span className="text-lg font-bold">{streakDays}</span> 日
                </span>
                <span className="text-xs text-muted-foreground">
                  あと {STREAK_BONUS_SCHEDULE.length - streakDays} 日でコンプリート
                </span>
              </div>

              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <Button
                  type="button"
                  className="min-h-11"
                  onClick={handleCheckIn}
                  disabled={isCheckingIn || isCheckedInToday}
                >
                  {isCheckingIn && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isCheckedInToday
                    ? "チェックイン済み"
                    : isCheckingIn
                      ? "チェックイン中..."
                      : "チェックイン"}
                </Button>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span>日本時間（JST）で毎日0時にリセット</span>
                </div>
              </div>

              {/* 5列x3行のグリッド (ストリーク日数 + ゴール) */}
              <div className="grid grid-cols-5 gap-2">
                {STREAK_BONUS_SCHEDULE.map((amount, index) => {
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
                        "text-[10px] font-bold mb-1",
                        isCompleted ? "text-purple-200" : isNext ? "text-purple-600" : "text-gray-400"
                      )}>
                        Day {day}
                      </span>

                      {isCompleted ? (
                        <Check className="w-5 h-5 animate-in zoom-in duration-300" strokeWidth={3} />
                      ) : (
                        <div className="flex flex-col items-center">
                          {isBigBonus ? (
                            <Gift className={cn("w-4 h-4 mb-0.5", isNext ? "text-purple-500" : "text-gray-300")} />
                          ) : (
                            <div className={cn("w-3 h-3 rounded-full mb-1", isNext ? "bg-purple-200" : "bg-gray-200")} />
                          )}
                          <span className={cn("text-[10px] font-bold leading-none", isNext ? "text-purple-700" : "")}>
                            +{amount}
                          </span>
                        </div>
                      )}

                      {isNext && (
                        <span className="absolute -top-1 -right-1 flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
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
                  streakDays >= STREAK_BONUS_SCHEDULE.length
                    ? "bg-yellow-400 border-yellow-500 text-white shadow-md"
                    : "bg-yellow-50 border-yellow-200 text-yellow-600"
                )}>
                  <span className={cn(
                    "text-[10px] font-bold mb-1",
                    streakDays >= STREAK_BONUS_SCHEDULE.length ? "text-yellow-100" : "text-yellow-600/70"
                  )}>
                    GOAL
                  </span>
                  <Trophy className={cn(
                    "w-6 h-6 mb-1",
                    streakDays >= STREAK_BONUS_SCHEDULE.length ? "text-white animate-bounce" : "text-yellow-500"
                  )} strokeWidth={2} />

                  {streakDays >= STREAK_BONUS_SCHEDULE.length && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-lg bg-yellow-400 opacity-20"></span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </ChallengeCard>
        </div>

        {/* 3. デイリー投稿特典 */}
        <div className="mb-6">
          <ChallengeCard
            title="デイリー投稿ボーナス"
            description="1日1回、生成した画像を投稿してペルコインをゲット！毎日の習慣にしてコインを貯めよう。"
            percoinAmount={DAILY_POST_BONUS_AMOUNT}
            icon={CalendarCheck2}
            color="blue"
            className="h-full"
          >
            <div className="space-y-4">
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
                      {isDailyBonusReceived ? "今日のボーナス獲得済み" : "まだ投稿していません"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {isDailyBonusReceived
                        ? "明日も投稿してコインをゲットしよう！"
                        : "画像を投稿して30コインをゲット！"}
                    </div>
                  </div>
                </div>

                {isDailyBonusReceived && (
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground mb-1">リセットまで</div>
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
                  <span>リセットまで {timeToReset}</span>
                </div>
              )}

              <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                <span className="font-bold shrink-0">Tips:</span>
                <span>日本時間（JST）で毎日0時にリセットされます</span>
              </div>
            </div>
          </ChallengeCard>
        </div>
      </Masonry>
    </div>
  );
}
