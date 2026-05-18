"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface GenerationSubmitButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isGenerating: boolean;
  generateLabel: string;
  generatingLabel: string;
  /**
   * 認証ユーザー向けに表示する消費ペルコイン数。
   * null / undefined のときは「（消費：…）」サフィックスを表示しない（ゲスト無料枠など）。
   * isGenerating 中も非表示にする（ボタン本体のラベルが「生成中…」に変わるため）。
   */
  costAmount?: number | null;
  ariaLabel?: string;
  /** Coordinate のチュートリアル用 data-tour 属性。 */
  dataTour?: string;
  /** 生成中に Sparkles アイコンをパルスさせるか（coordinate のみ true）。 */
  pulseIconWhenGenerating?: boolean;
  className?: string;
}

export function GenerationSubmitButton({
  onClick,
  disabled,
  isGenerating,
  generateLabel,
  generatingLabel,
  costAmount,
  ariaLabel,
  dataTour,
  pulseIconWhenGenerating = false,
  className,
}: GenerationSubmitButtonProps) {
  const tCommon = useTranslations("common");

  const showCost =
    !isGenerating && typeof costAmount === "number" && costAmount > 0;
  const costSuffix = showCost
    ? tCommon("generationCostSuffix", { amount: costAmount as number })
    : null;

  return (
    <Button
      type="button"
      className={cn("w-full", className)}
      size="lg"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      data-tour={dataTour}
    >
      <Sparkles
        className={cn(
          "mr-2 h-5 w-5",
          isGenerating && pulseIconWhenGenerating && "animate-pulse"
        )}
        aria-hidden="true"
      />
      <span className="inline-flex items-baseline">
        <span>{isGenerating ? generatingLabel : generateLabel}</span>
        {costSuffix ? (
          <span className="text-xs font-normal opacity-90">{costSuffix}</span>
        ) : null}
      </span>
    </Button>
  );
}
