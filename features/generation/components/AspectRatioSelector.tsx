"use client";

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { useTranslations } from "next-intl";
import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FREE_OUTPUT_ASPECT_RATIO_MODES,
  type FreeOutputAspectRatioMode,
} from "@/shared/generation/style-output-aspect-ratio";

interface AspectRatioSelectorProps {
  value: FreeOutputAspectRatioMode;
  onChange: (value: FreeOutputAspectRatioMode) => void;
  disabled?: boolean;
}

/**
 * じゆうモード(Free Style)の出力比率セレクタ。
 *
 * - 選択肢は source(自動) + 明示9比率(FREE_OUTPUT_ASPECT_RATIO_MODES)。
 * - Radix RadioGroup を使い radiogroup/radio セマンティクス・キーボード操作
 *   (矢印キー移動)・RTL を担保する。選択は aria-checked と ✓ アイコン(色以外の表現)。
 * - 横スクロールのプレビューカード。各カードは実際の比率の形。source は
 *   固定枠ではなく「自動調整」を示す破線枠＋アイコンで表現する。
 */
export function AspectRatioSelector({
  value,
  onChange,
  disabled,
}: AspectRatioSelectorProps) {
  const t = useTranslations("free");

  return (
    <div>
      <span
        id="free-aspect-label"
        className="mb-2 block text-base font-medium"
      >
        {t("aspectSectionTitle")}
      </span>
      <RadioGroupPrimitive.Root
        value={value}
        onValueChange={(next) => onChange(next as FreeOutputAspectRatioMode)}
        disabled={disabled}
        orientation="horizontal"
        aria-labelledby="free-aspect-label"
        // フォーカスリングが切れないよう左右に余白を確保しつつ横スクロール。
        className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 pt-1"
      >
        {FREE_OUTPUT_ASPECT_RATIO_MODES.map((mode) => {
          const isSource = mode === "source";
          const [w, h] = isSource ? [1, 1] : mode.split(":").map(Number);
          const orientation = isSource
            ? t("aspectAuto")
            : w === h
              ? t("aspectSquare")
              : w > h
                ? t("aspectLandscape")
                : t("aspectPortrait");
          // カード下のキャプション: source=自動 / 1:1=正方形 / それ以外=比率そのもの。
          const caption = isSource
            ? t("aspectAuto")
            : w === h
              ? t("aspectSquare")
              : mode;
          // スクリーンリーダー向けには比率と向きを明示(色に依存しない情報)。
          const ariaLabel = isSource
            ? `${t("aspectAuto")}（${t("aspectAutoDescription")}）`
            : `${mode} ${orientation}`;

          return (
            <RadioGroupPrimitive.Item
              key={mode}
              value={mode}
              aria-label={ariaLabel}
              className={cn(
                "group flex shrink-0 flex-col items-center gap-1.5 rounded-lg outline-none",
                "focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              {/* プレビュー枠(比率の形)。選択時はグラデ背景 + 枠色で強調。 */}
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-20 items-center justify-center rounded-lg text-xs font-semibold transition-colors",
                  isSource
                    ? "border-2 border-dashed border-gray-300 bg-gray-50 text-gray-400"
                    : "border-2 border-gray-200 bg-gray-100 text-gray-500",
                  "group-data-[state=checked]:border-transparent group-data-[state=checked]:bg-gradient-to-br group-data-[state=checked]:from-pink-500 group-data-[state=checked]:to-orange-400 group-data-[state=checked]:text-white",
                )}
                style={
                  isSource
                    ? { width: "5rem" }
                    : { aspectRatio: `${w} / ${h}` }
                }
              >
                {isSource ? <Sparkles className="size-5" /> : mode}
              </span>
              {/* キャプション + 選択チェック(色以外でも選択が分かる非色依存の表現)。 */}
              <span
                className={cn(
                  "flex items-center gap-0.5 text-xs text-gray-600",
                  "group-data-[state=checked]:font-semibold group-data-[state=checked]:text-gray-900",
                )}
              >
                <Check
                  aria-hidden="true"
                  className="hidden size-3 group-data-[state=checked]:inline"
                />
                {caption}
              </span>
            </RadioGroupPrimitive.Item>
          );
        })}
      </RadioGroupPrimitive.Root>
    </div>
  );
}
