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
  composeGptImage2Model,
  parseGptImage2Model,
  type GeminiModel,
  type GptImage2Quality,
} from "@/features/generation/types";
import type { ModelSelectAuthState } from "./LockableModelSelect";

interface GptImage2QualitySelectorProps {
  value: GeminiModel;
  onChange: (next: GeminiModel) => void;
  onLockedClick: () => void;
  authState: ModelSelectAuthState;
  disabled?: boolean;
  isModelSelectable?: (model: GeminiModel) => boolean;
}

interface QualityOption {
  value: GptImage2Quality;
  labelKey:
    | "gptImage2QualityLow"
    | "gptImage2QualityMedium"
    | "gptImage2QualityHigh";
  tierTag: ModelTagKey;
}

const QUALITY_OPTIONS: ReadonlyArray<QualityOption> = [
  { value: "low", labelKey: "gptImage2QualityLow", tierTag: "tierLight" },
  {
    value: "medium",
    labelKey: "gptImage2QualityMedium",
    tierTag: "tierBalanced",
  },
  { value: "high", labelKey: "gptImage2QualityHigh", tierTag: "tierQuality" },
];

/**
 * ChatGPT Images 2.0 を選択中のときに表示される「レンダリング品質（Low/Medium/High）」セレクター。
 * 行ごとに色付きの tier チップを添える。`GptImage2SizeSelector` と組み合わせて
 * quality × sizeTier の 2 軸を独立に選べるようにする。
 *
 * Gemini 系（Nano Banana 2 / Pro）を選択中は描画しない。
 */
export function GptImage2QualitySelector({
  value,
  onChange,
  onLockedClick,
  authState,
  disabled,
  isModelSelectable,
}: GptImage2QualitySelectorProps) {
  const t = useTranslations("coordinate");
  const parsed = parseGptImage2Model(value);

  if (!parsed) {
    return null;
  }

  const isGuest = authState === "guest";

  const handleValueChange = (next: string) => {
    const nextQuality = next as GptImage2Quality;
    const nextModel = composeGptImage2Model(nextQuality, parsed.sizeTier);
    if (!isModelAvailableForGeneration(nextModel)) {
      return;
    }
    if (!(isModelSelectable?.(nextModel) ?? true)) {
      return;
    }
    if (isGuest && !isCanonicalGuestAllowedModel(nextModel)) {
      onLockedClick();
      return;
    }
    onChange(nextModel);
  };

  return (
    <div className="space-y-3" data-tour="tour-gpt-image-2-quality">
      <Label className="text-base font-medium mb-1 flex items-center gap-2">
        <span>{t("gptImage2QualityLabel")}</span>
        <LabelInfoTooltip
          ariaLabel={t("modelTooltipAria")}
          content={
            <span className="whitespace-pre-line">
              {t("modelTooltipContent")}
            </span>
          }
          contentClassName="max-w-[24rem] px-3 py-2 text-sm leading-6"
        />
      </Label>
      <Select
        value={parsed.quality}
        onValueChange={handleValueChange}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {QUALITY_OPTIONS.map((option) => {
            const optionModel = composeGptImage2Model(
              option.value,
              parsed.sizeTier
            );
            const isLocked =
              isGuest && !isCanonicalGuestAllowedModel(optionModel);
            const isDisabled = !(isModelSelectable?.(optionModel) ?? true);
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
                aria-disabled={isLocked || isDisabled || undefined}
                aria-haspopup={isLocked ? "dialog" : undefined}
                data-locked={isLocked || undefined}
                disabled={isDisabled || undefined}
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
