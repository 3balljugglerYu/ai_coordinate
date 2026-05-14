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
  composeGeminiBananaModel,
  getSizeTiersForFamily,
  parseGeminiBananaModel,
  type GeminiBananaSizeTier,
  type GeminiModel,
} from "@/features/generation/types";
import type { ModelSelectAuthState } from "./LockableModelSelect";

interface GeminiBananaSizeSelectorProps {
  value: GeminiModel;
  onChange: (next: GeminiModel) => void;
  onLockedClick: () => void;
  authState: ModelSelectAuthState;
  disabled?: boolean;
  isModelSelectable?: (model: GeminiModel) => boolean;
}

const SIZE_LABEL_KEYS = {
  "0.5k": "geminiBananaSize05k",
  "1k": "geminiBananaSize1k",
  "2k": "geminiBananaSize2k",
  "4k": "geminiBananaSize4k",
} as const satisfies Record<
  GeminiBananaSizeTier,
  "geminiBananaSize05k" | "geminiBananaSize1k" | "geminiBananaSize2k" | "geminiBananaSize4k"
>;

/**
 * Nano Banana 2 / Pro 選択時に表示する出力サイズセレクター。
 * `GptImage2SizeSelector` の Gemini 版で、family ごとに許可される size tier
 * （nano-2: 0.5K/1K、nano-pro: 1K/2K/4K）を `getSizeTiersForFamily` から得て描画する。
 */
export function GeminiBananaSizeSelector({
  value,
  onChange,
  onLockedClick,
  authState,
  disabled,
  isModelSelectable,
}: GeminiBananaSizeSelectorProps) {
  const t = useTranslations("coordinate");
  const parsed = parseGeminiBananaModel(value);

  if (!parsed) {
    return null;
  }

  const isGuest = authState === "guest";
  const sizeTiers = getSizeTiersForFamily(parsed.family);

  const handleValueChange = (next: string) => {
    const nextSizeTier = next as GeminiBananaSizeTier;
    const nextModel = composeGeminiBananaModel(parsed.family, nextSizeTier);
    if (!nextModel) {
      return;
    }
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
    <div className="space-y-3" data-tour="tour-gemini-banana-size">
      <div className="space-y-1">
        <Label className="text-base font-medium block">
          {t("geminiBananaSizeLabel")}
        </Label>
        <p className="text-xs leading-5 text-gray-500">
          {t("geminiBananaSizeDescription")}
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
          {sizeTiers.map((sizeTier) => {
            const optionModel = composeGeminiBananaModel(
              parsed.family,
              sizeTier
            );
            // 型上 composeGeminiBananaModel は family と size の不整合で null を返し得るが、
            // sizeTiers は family 専用リストなのでここでは常に non-null。
            if (!optionModel) {
              return null;
            }
            const isLocked = isGuest && !isCanonicalGuestAllowedModel(optionModel);
            const isDisabled = !(isModelSelectable?.(optionModel) ?? true);
            const label = t(SIZE_LABEL_KEYS[sizeTier]);
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
                key={sizeTier}
                value={sizeTier}
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
