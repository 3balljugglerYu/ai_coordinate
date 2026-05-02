"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CheckInStreakBonusResponse } from "@/features/challenges/lib/api";
import { RedPulseDot } from "./RedPulseDot";
import { RewardBurst, type RewardTier } from "./RewardBurst";

/**
 * チェックインボタン マイクロインタラクション（簡略版）。
 *
 *  0ms  : tap                              → phase = "pressed", API 呼び出し開始
 *  120ms: ボタン軽く縮小→戻り 完了         （CSS animation で自動完了）
 *  550ms: 「チェックイン完了！」表示        → phase = "complete"
 *  900ms: 「+N ペルコイン獲得！」浮遊表示 → phase = "rewardShown" + RewardBurst 起動
 *  1000ms: Day N 達成済み（DayCard 弾み）    → onOptimisticDayPop()
 *  1200ms: 連続記録 N-1→N 切り替え           → onOptimisticStreakAdvance()
 *  1500ms: タイムライン終了                   → phase = "done" + onTimelineDone()
 *
 * 完了後は「チェックイン完了！」のまま固定（disabled）。翌日になるまで維持。
 * 楽観的UI: タップ即座にこのタイムラインを開始。API 失敗判明時のみ revert
 *  → 全タイマー clear、phase = "idle"、親に onError() を通知。
 *
 * 「受け取り中...」「本日はチェックイン済み」のステップは削除済み。
 */
type CheckInPhase =
  | "idle"
  | "pressed"
  | "complete"
  | "rewardShown"
  | "done";

const T_COMPLETE_MS = 550;
const T_REWARD_MS = 900;
const T_DAY_POP_MS = 1000;
const T_STREAK_ADVANCE_MS = 1200;
const T_DONE_MS = 1500;

interface CheckInButtonProps {
  /** 既にチェックイン済みなら disabled になり「チェックイン完了！」表示で固定 */
  isCheckedInToday: boolean;
  /** 楽観的に表示する次回ボーナス額（API 結果が来たら上書き） */
  expectedAmount: number;
  /** 演出階層: normal=通常 / bonus=7日目等 / goal=14日目コンプリート */
  expectedTier: RewardTier;
  /**
   * API 呼び出し関数。失敗時は throw する。
   * 親で実装し、CheckInButton はタイムラインと並行して await する。
   */
  onCheckIn: () => Promise<CheckInStreakBonusResponse>;
  /** 1000ms 時点で発火: 親が justUnlockedDay state を立てて DayCard を弾ませる */
  onOptimisticDayPop: () => void;
  /** 1200ms 時点で発火: 親が streakDays を +1（楽観的） */
  onOptimisticStreakAdvance: () => void;
  /**
   * API 成功で発火（タイムラインとは独立）: 親が isCheckedInToday=true 等を反映、
   * トースト表示、refreshUnreadCount / refreshMissionDots / router.refresh を行う。
   * 親は async 関数を渡しても良いが、CheckInButton はその完了を待たない（fire-and-forget）。
   */
  onSuccess: (result: CheckInStreakBonusResponse) => void | Promise<void>;
  /** API 失敗で発火: 親が楽観的 state を revert + destructive toast */
  onError: (error: unknown) => void;
  /**
   * 1500ms 時点（done フェーズ進入時）に発火。
   * 親側で「API 完了 & タイムライン完了」両方を待ってから optimisticOverride を解除するための合流ポイント。
   */
  onTimelineDone?: () => void;
}

export function CheckInButton({
  isCheckedInToday,
  expectedAmount,
  expectedTier,
  onCheckIn,
  onOptimisticDayPop,
  onOptimisticStreakAdvance,
  onSuccess,
  onError,
  onTimelineDone,
}: CheckInButtonProps) {
  const t = useTranslations("challenge");
  const [phase, setPhase] = useState<CheckInPhase>("idle");
  const [actualAmount, setActualAmount] = useState<number | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach((id) => clearTimeout(id));
    timersRef.current = [];
  };

  useEffect(() => {
    return clearTimers;
  }, []);

  const handleClick = async () => {
    if (phase !== "idle" || isCheckedInToday) return;

    setPhase("pressed");
    setActualAmount(null);

    // タイムラインを起動（楽観的）
    const schedule = (delay: number, fn: () => void) => {
      const id = setTimeout(fn, delay);
      timersRef.current.push(id);
    };
    schedule(T_COMPLETE_MS, () => setPhase("complete"));
    schedule(T_REWARD_MS, () => setPhase("rewardShown"));
    schedule(T_DAY_POP_MS, () => onOptimisticDayPop());
    schedule(T_STREAK_ADVANCE_MS, () => onOptimisticStreakAdvance());
    schedule(T_DONE_MS, () => {
      setPhase("done");
      onTimelineDone?.();
    });

    try {
      const result = await onCheckIn();
      // API が返した実値で上書き（チラつき軽減のため reward 表示前に届けば差し替わる）
      if (typeof result.bonus_granted === "number" && result.bonus_granted > 0) {
        setActualAmount(result.bonus_granted);
      }
      onSuccess(result);
    } catch (error) {
      // 失敗判明: タイムラインを停止し、phase を idle に戻す → 親に通知
      clearTimers();
      setPhase("idle");
      setActualAmount(null);
      onError(error);
    }
  };

  // 表示テキストの決定。
  // - 既にチェックイン済み（再訪・連続日達成後）: 「チェックイン完了！」で固定
  // - タイムライン上 complete 以降: 「チェックイン完了！」
  // - それ以外（idle / pressed の 0〜550ms）: 「チェックイン」
  const isAnimating = phase !== "idle";
  const showCompleteLabel =
    isCheckedInToday ||
    phase === "complete" ||
    phase === "rewardShown" ||
    phase === "done";
  const labelText = showCompleteLabel
    ? t("checkInComplete")
    : t("checkIn");

  // 報酬ラベル: API 実値があればそちらを優先、無ければ楽観値
  const rewardAmount = actualAmount ?? expectedAmount;
  const rewardLabel = t("rewardCoinsLabel", { amount: rewardAmount });
  // 14日目（goal）のときだけ「2週間コンプリート！」見出しを付与し、
  // RewardBurst で 2 行レイアウトに切り替える
  const rewardHeadline =
    expectedTier === "goal" ? t("goalCompleteHeadline") : undefined;

  return (
    <span className="relative inline-flex">
      <Button
        type="button"
        className={cn(
          "min-h-11 relative",
          phase === "pressed" && "check-in-fx-button-press"
        )}
        onClick={handleClick}
        disabled={isAnimating || isCheckedInToday}
      >
        {/*
          ローディング表示は pressed フェーズ（0–550ms）の間だけスピナーを出す。
          テキストは「チェックイン」のまま据え置き、視覚的な "処理中" フィードバックのみ提供。
          550ms で phase = "complete" に遷移し、ラベルが「チェックイン完了！」に変わる
          のと同時にスピナーは自動的に消える。
        */}
        {phase === "pressed" && (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        )}
        <span
          key={labelText}
          className={cn(
            isAnimating || isCheckedInToday ? "check-in-fx-label-swap" : ""
          )}
        >
          {labelText}
        </span>
      </Button>

      {/* タップ直後のグロー（成功演出の背面光） */}
      {(phase === "complete" || phase === "rewardShown") && (
        <span
          aria-hidden="true"
          className={cn(
            "check-in-fx-glow",
            expectedTier !== "normal" && "check-in-fx-glow-strong"
          )}
        />
      )}

      {/* +N ペルコイン獲得！ + パーティクル */}
      <RewardBurst
        show={phase === "rewardShown" || phase === "done"}
        label={rewardLabel}
        headline={rewardHeadline}
        tier={expectedTier}
      />

      {/* 未チェックイン時のレッドパルスドット（既存挙動を踏襲） */}
      {!isCheckedInToday && phase === "idle" && <RedPulseDot />}
    </span>
  );
}
