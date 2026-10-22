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
  composeOpenAIImageModel,
  parseOpenAIImageModel,
  type GeminiModel,
  type GptImage2Quality,
} from "@/features/generation/types";
import type { OpenAIImageFamily } from "@/shared/generation/openai-image-model";
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
  tierTag: ModelTagKey;
}

const QUALITY_OPTIONS: ReadonlyArray<QualityOption> = [
  { value: "low", tierTag: "tierLight" },
  { value: "medium", tierTag: "tierBalanced" },
  { value: "high", tierTag: "tierQuality" },
];

/**
 * 品質の行の文言。時間の目安は本番の記録の実際の待ち時間に合わせているので、
 * family ごとに持つ(2.5 は 2.0 の約半分。2026-10-23 にメニューの文言をそろえた)。
 */
const QUALITY_LABEL_KEYS = {
  "gpt-image-2": {
    low: "gptImage2QualityLow",
    medium: "gptImage2QualityMedium",
    high: "gptImage2QualityHigh",
  },
  "gpt-image-2.5-flare": {
    low: "gptImage25QualityLow",
    medium: "gptImage25QualityMedium",
    high: "gptImage25QualityHigh",
  },
} as const satisfies Record<OpenAIImageFamily, Record<GptImage2Quality, string>>;

/**
 * ChatGPT Images（2.0 / 2.5）を選択中のときに表示される「レンダリング品質（Low/Medium/High）」セレクター。
 * 品質は family を跨いで同じ 3 段で、`parsed.family` を保ったまま組み替える（ADR-006）。
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
  const parsed = parseOpenAIImageModel(value);

  if (!parsed) {
    return null;
  }

  const isGuest = authState === "guest";

  const handleValueChange = (next: string) => {
    const nextQuality = next as GptImage2Quality;
    const nextModel = composeOpenAIImageModel(
      parsed.family,
      nextQuality,
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
            const optionModel = composeOpenAIImageModel(
              parsed.family,
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
                <span>{t(QUALITY_LABEL_KEYS[parsed.family][option.value])}</span>
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
