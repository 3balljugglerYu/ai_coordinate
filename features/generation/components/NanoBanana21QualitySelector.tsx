"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  isCanonicalGuestAllowedModel,
  isModelAvailableForGeneration,
} from "@/features/generation/lib/model-config";
import {
  MODEL_TAG_DISPLAY,
  type ModelTagKey,
} from "@/features/generation/lib/model-tags";
import { LabelInfoTooltip } from "@/components/LabelInfoTooltip";
import {
  composeNanoBanana21Model,
  parseNanoBanana21Model,
  type NanoBanana21ThinkingLevel,
} from "@/shared/generation/gemini-banana-model";
import type { GeminiModel } from "@/features/generation/types";
import type { ModelSelectAuthState } from "./LockableModelSelect";

interface NanoBanana21QualitySelectorProps {
  value: GeminiModel;
  onChange: (next: GeminiModel) => void;
  onLockedClick: () => void;
  authState: ModelSelectAuthState;
  disabled?: boolean;
  isModelSelectable?: (model: GeminiModel) => boolean;
}

interface QualityOption {
  /** 内部の考える量。画面では Low / Medium / High と見せる(ADR-002) */
  value: NanoBanana21ThinkingLevel;
  labelKey:
    | "nanoBanana21QualityLow"
    | "nanoBanana21QualityMedium"
    | "nanoBanana21QualityHigh";
  tierTag: ModelTagKey;
}

const QUALITY_OPTIONS: ReadonlyArray<QualityOption> = [
  { value: "minimal", labelKey: "nanoBanana21QualityLow", tierTag: "tierLight" },
  {
    value: "medium",
    labelKey: "nanoBanana21QualityMedium",
    tierTag: "tierBalanced",
  },
  { value: "high", labelKey: "nanoBanana21QualityHigh", tierTag: "tierQuality" },
];

/**
 * Nano Banana 2.1 を選択中のときに表示される「品質(Low/Medium/High)」セレクター。
 *
 * 2.1 の品質は、描く前に考える量(thinking level: minimal / medium / high)で、
 * 画像の大きさは変わらない。GPT の「レンダリング品質」とは意味が違うので、
 * `GptImage2QualitySelector` は使わず、見出しと説明を 2.1 用に持つ(ADR-002)。
 * 形(セレクター・tier チップ・南京錠)は GPT 用と揃える。
 *
 * 2.1 以外を選択中は描画しない。
 */
export function NanoBanana21QualitySelector({
  value,
  onChange,
  onLockedClick,
  authState,
  disabled,
  isModelSelectable,
}: NanoBanana21QualitySelectorProps) {
  const t = useTranslations("coordinate");
  const parsed = parseNanoBanana21Model(value);

  if (!parsed) {
    return null;
  }

  const isGuest = authState === "guest";

  const handleValueChange = (next: string) => {
    const nextModel = composeNanoBanana21Model(
      next as NanoBanana21ThinkingLevel,
      parsed.sizeTier
    );
    if (!isModelAvailableForGeneration(nextModel)) {
      return;
    }
    const isGuestLocked =
      isGuest && !isCanonicalGuestAllowedModel(nextModel);
    const isPlanLocked = !(isModelSelectable?.(nextModel) ?? true);
    if (isGuestLocked || isPlanLocked) {
      onLockedClick();
      return;
    }
    onChange(nextModel);
  };

  return (
    <div className="space-y-3" data-tour="tour-nano-banana-2-1-quality">
      <Label className="text-base font-medium mb-1 flex items-center gap-2">
        <span>{t("nanoBanana21QualityLabel")}</span>
        <LabelInfoTooltip
          ariaLabel={t("nanoBanana21QualityTooltipAria")}
          content={
            <span className="whitespace-pre-line">
              {t("nanoBanana21QualityTooltipContent")}
            </span>
          }
          contentClassName="max-w-[24rem] px-3 py-2 text-sm leading-6"
        />
      </Label>
      <Select
        value={parsed.thinkingLevel}
        onValueChange={handleValueChange}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {QUALITY_OPTIONS.map((option) => {
            const optionModel = composeNanoBanana21Model(
              option.value,
              parsed.sizeTier
            );
            const isGuestLocked =
              isGuest && !isCanonicalGuestAllowedModel(optionModel);
            const isPlanLocked = !(isModelSelectable?.(optionModel) ?? true);
            const isLocked = isGuestLocked || isPlanLocked;
            const tagDisplay = MODEL_TAG_DISPLAY[option.tierTag];
            const optionContent = (
              <span className="flex items-center gap-2">
                <span>{t(option.labelKey)}</span>
                <Badge
                  className={cn(
                    "px-1.5 py-0 text-[10px] leading-4 font-medium",
                    tagDisplay.className
                  )}
                >
                  {t(tagDisplay.messageKey)}
                </Badge>
              </span>
            );
            return (
              <SelectItem
                key={option.value}
                value={option.value}
                aria-disabled={isLocked || undefined}
                aria-haspopup={isLocked ? "dialog" : undefined}
                data-locked={isLocked || undefined}
              >
                {isLocked ? (
                  <span className="flex items-center gap-2">
                    <Lock
                      className="h-3.5 w-3.5 text-gray-500"
                      aria-hidden="true"
                    />
                    {optionContent}
                  </span>
                ) : (
                  optionContent
                )}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
