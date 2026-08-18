"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CountUpNumber } from "@/features/collections/components/CountUpNumber";
import { RewardBurst } from "@/features/challenges/components/RewardBurst";

/**
 * 「誰かのプロンプトを使った」日次ボーナスの付与モーダル。
 *
 * **生成が成功した瞬間に出す。** 投稿時の付与モーダルに相乗りさせると、
 * 投稿しない利用者には伝わらず、その日すでに投稿ボーナスを受け取っていると
 * モーダル自体が開かないため、もらったことに気づけない。
 *
 * 演出（CountUpNumber / RewardBurst）は投稿ボーナス・完走報酬と同じものを使う。
 * 付与のたびに見た目が違うと「別の何か」に見えるため。
 */
interface PromptUseBonusModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 付与されたペルコイン数。0 のときは呼び出し側で開かない。 */
  amount: number;
}

export function PromptUseBonusModal({
  open,
  onOpenChange,
  amount,
}: PromptUseBonusModalProps) {
  const t = useTranslations("credits");
  const [showBurst, setShowBurst] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        max-w-sm だけ指定すると基底の max-w-[calc(100%-2rem)] を上書きして
        スマホで全幅に見える（投稿ボーナスのモーダルと同じ理由・同じ書き方）。
      */}
      <DialogContent className="rounded-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center text-base font-semibold text-slate-900">
            {t("promptUseBonusTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="relative flex flex-col items-center gap-1 py-1">
          <RewardBurst
            show={showBurst}
            label={t("promptUseBonusAmount", { amount })}
            tier="bonus"
          />
          <p className="flex items-baseline gap-1 text-4xl font-bold text-violet-600">
            <span aria-hidden>+</span>
            <CountUpNumber
              value={amount}
              onDone={() => setShowBurst(true)}
              className="tabular-nums"
            />
            <span className="text-base font-semibold text-slate-600">
              {t("promptUseBonusUnit")}
            </span>
          </p>
        </div>

        <p className="text-center text-sm text-slate-600">
          {t("promptUseBonusBody")}
        </p>

        <Button
          onClick={() => onOpenChange(false)}
          className="w-full rounded-xl bg-violet-600 hover:bg-violet-700"
        >
          {t("promptUseBonusClose")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
