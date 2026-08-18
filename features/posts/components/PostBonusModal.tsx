"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { CountUpNumber } from "@/features/collections/components/CountUpNumber";
import { RewardBurst } from "@/features/challenges/components/RewardBurst";

/**
 * 投稿ボーナスの付与モーダル。
 *
 * これまではトーストで出していたが、**フリースタイル投稿の直後は
 * クリエイター還元をいちばん伝えやすい瞬間**なので、腰を据えて読める
 * モーダルへ格上げした。バナーや専用ページと違い、投稿した本人に確実に届く。
 *
 * 演出はコレクション完走報酬の `CountUpNumber` / `RewardBurst` を流用する
 * (見た目が揃うのと、実装が既にあるため)。
 */

interface PostBonusModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 付与されたペルコイン数。0 のときは呼び出し側で開かない。 */
  amount: number;
  /** 課金プランの倍率（1より大きいときだけバッジを出す）。 */
  multiplier?: number;
  /**
   * 投稿した作品の生成方法。`free` のときだけ還元の案内を出す。
   * ワンタップの利用還元は現在 0（未有効）なので、出すと嘘になる。
   */
  generationType?: string | null;
  /**
   * 他人に使われたときに原作者へ入る額。0 なら還元は停止中なので案内を出さない。
   * 文言に焼き込まず設定値を渡すこと（額を変えたときに嘘になるため）。
   */
  promptUsageRewardAmount: number;
  /**
   * 他の人のプロンプトで作った作品への上乗せ（0 なら対象外）。
   * 投稿ボーナスとは別の付与なので、合計を出したうえで内訳も並べる。
   */
  promptUseBonusAmount?: number;
}

export function PostBonusModal({
  open,
  onOpenChange,
  amount,
  multiplier,
  generationType,
  promptUsageRewardAmount,
  promptUseBonusAmount = 0,
}: PostBonusModalProps) {
  const t = useTranslations("posts");
  const [showBurst, setShowBurst] = useState(false);

  const hasBoostedBonus = typeof multiplier === "number" && multiplier > 1;
  /*
    大きな数字は**合計**を出す。もらった総額が一目で分かるのが第一で、
    内訳はその下に並べる。別々にアニメーションさせると、同じ瞬間の付与が
    2回に分かれて見えて「いくらもらったのか」が分からなくなる。
  */
  const totalAmount = amount + promptUseBonusAmount;
  // 還元の案内はフリースタイルのときだけ。還元が停止中(0)なら出さない
  const showCreatorReward =
    generationType === "free" && promptUsageRewardAmount > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        max-w-sm だけ指定すると、基底の max-w-[calc(100%-2rem)] を
        上書きしてしまい、スマホ(390px)で左右3pxしか残らず全幅に見える。
        小さい画面では基底の余白を活かし、sm 以上でだけ幅を絞る。
      */}
      <DialogContent className="rounded-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center text-base font-semibold text-slate-900">
            {t("postBonusTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="relative flex flex-col items-center gap-1 py-1">
          <RewardBurst
            show={showBurst}
            label={t("postBonusAmount", { amount: totalAmount })}
            tier="bonus"
          />
          <p className="flex items-baseline gap-1 text-4xl font-bold text-violet-600">
            <span aria-hidden>+</span>
            <CountUpNumber
              value={totalAmount}
              onDone={() => setShowBurst(true)}
              className="tabular-nums"
            />
            <span className="text-base font-semibold text-slate-600">
              {t("postBonusUnit")}
            </span>
          </p>
          {hasBoostedBonus ? (
            <Badge
              variant="outline"
              className="border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700"
            >
              {t("dailyBonusMultiplierBadge", {
                multiplier: multiplier?.toFixed(1) ?? "1.0",
              })}
            </Badge>
          ) : null}
        </div>

        {promptUseBonusAmount > 0 ? (
          <div className="space-y-1 rounded-xl bg-violet-50/60 p-3 text-sm text-slate-700">
            <div className="flex items-center justify-between">
              <span>{t("postBonusBreakdownPost")}</span>
              <span className="font-semibold tabular-nums">+{amount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{t("postBonusBreakdownPromptUse")}</span>
              <span className="font-semibold tabular-nums">
                +{promptUseBonusAmount}
              </span>
            </div>
          </div>
        ) : null}

        {showCreatorReward ? (
          /*
            公開を促す文言にはしない。公開でも非公開でも他人は生成できるので、
            クリエイターにとっては**非公開のままの方が有利**（中身を見られない）。
          */
          <div className="space-y-2 rounded-xl bg-violet-50/70 p-3 text-sm text-slate-700">
            <p>
              {t("postBonusCreatorReward", {
                amount: promptUsageRewardAmount,
              })}
            </p>
            <p className="text-xs text-slate-600">
              {t("postBonusPrivateNote")}
            </p>
            <Link
              // ロケール付きのルートは存在しない(app/creator-rewards のみ)。
              // ミッション画面の導線も /creator-rewards に張っている
              href="/creator-rewards"
              className="inline-block text-xs font-medium text-violet-700 underline"
              onClick={() => onOpenChange(false)}
            >
              {t("postBonusCreatorRewardLink")}
            </Link>
          </div>
        ) : null}

        {/*
          ブランドCTAの指定に揃える(チュートリアル開始モーダル等と同じ)。
          投稿のたびに出る画面なので、既存のボタンと見た目を揃えておく。
        */}
        <Button
          className="min-h-[48px] w-full rounded-full border-0 bg-gradient-to-r from-pink-500 to-orange-400 text-base font-bold text-white shadow-[0_6px_16px_rgba(236,72,153,0.28)] transition hover:from-pink-600 hover:to-orange-500"
          onClick={() => onOpenChange(false)}
        >
          {t("postBonusClose")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
