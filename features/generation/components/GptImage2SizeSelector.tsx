"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  isCanonicalGuestAllowedModel,
  isModelAvailableForGeneration,
  getPercoinCost,
} from "@/features/generation/lib/model-config";
import {
  composeGptImage2Model,
  parseGptImage2Model,
  type GeminiModel,
  type GptImage2SizeTier,
} from "@/features/generation/types";
import type { ModelSelectAuthState } from "./LockableModelSelect";

interface GptImage2SizeSelectorProps {
  value: GeminiModel;
  onChange: (next: GeminiModel) => void;
  onLockedClick: () => void;
  authState: ModelSelectAuthState;
  disabled?: boolean;
  isModelSelectable?: (model: GeminiModel) => boolean;
}

interface SizeOption {
  value: GptImage2SizeTier;
  labelKey: "gptImage2Size1k" | "gptImage2Size2k" | "gptImage2Size4k";
}

const SIZE_OPTIONS: ReadonlyArray<SizeOption> = [
  { value: "1k", labelKey: "gptImage2Size1k" },
  { value: "2k", labelKey: "gptImage2Size2k" },
  { value: "4k", labelKey: "gptImage2Size4k" },
];

export function GptImage2SizeSelector({
  value,
  onChange,
  onLockedClick,
  authState,
  disabled,
  isModelSelectable,
}: GptImage2SizeSelectorProps) {
  const t = useTranslations("coordinate");
  const parsed = parseGptImage2Model(value);

  if (!parsed) {
    return null;
  }

  const isGuest = authState === "guest";

  const handleValueChange = (next: string) => {
    const nextSizeTier = next as GptImage2SizeTier;
    const nextModel = composeGptImage2Model(parsed.quality, nextSizeTier);
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
    <div className="space-y-3" data-tour="tour-gpt-image-2-size">
      <div className="space-y-1">
        <Label className="text-base font-medium block">
          {t("gptImage2SizeLabel")}
        </Label>
        <p className="text-xs leading-5 text-gray-500">
          {t("gptImage2SizeDescription")}
        </p>
      </div>
      <Select
        value={parsed.sizeTier}
        onValueChange={handleValueChange}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SIZE_OPTIONS.map((option) => {
            const optionModel = composeGptImage2Model(
              parsed.quality,
              option.value
            );
            const isLocked = isGuest && !isCanonicalGuestAllowedModel(optionModel);
            const isDisabled = !(isModelSelectable?.(optionModel) ?? true);
            const label = t(option.labelKey);
            const price = t("gptImage2SizePricePerImage", {
              cost: getPercoinCost(optionModel),
            });
            const optionContent = (
              <span className="flex w-full items-center justify-between gap-3">
                <span>{label}</span>
                <span className="text-xs text-gray-500">{price}</span>
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
