"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { LabelInfoTooltip } from "@/components/LabelInfoTooltip";
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
    <div className="space-y-3" data-tour="tour-gpt-image-2-size">
      <div className="space-y-1">
        <Label className="mb-1 flex items-center gap-2 text-base font-medium">
          <span>{t("gptImage2SizeLabel")}</span>
          <LabelInfoTooltip
            ariaLabel={t("gptImage2SizeTooltipAria")}
            content={
              <span className="whitespace-pre-line">
                {t("gptImage2SizeTooltipContent")}
              </span>
            }
            contentClassName="max-w-[24rem] px-3 py-2 text-sm leading-6"
          />
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
            const isGuestLocked =
              isGuest && !isCanonicalGuestAllowedModel(optionModel);
            const isPlanLocked = !(isModelSelectable?.(optionModel) ?? true);
            const isLocked = isGuestLocked || isPlanLocked;
            const label = t(option.labelKey);
            const optionContent = (
              <span className="flex w-full items-center">
                <span>{label}</span>
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
