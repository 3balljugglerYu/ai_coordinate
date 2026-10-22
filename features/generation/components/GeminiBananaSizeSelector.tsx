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
  composeGeminiBananaModel,
  getSizeTiersForFamily,
  parseGeminiBananaModel,
  type GeminiBananaSizeTier,
  type GeminiModel,
} from "@/features/generation/types";
import {
  NANO_BANANA_2_1_SIZE_TIERS,
  composeNanoBanana21Model,
  parseNanoBanana21Model,
  type NanoBanana21SizeTier,
} from "@/shared/generation/gemini-banana-model";
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
 * 選択中の Gemini モデルで選べるサイズと、サイズを変えたときの組み立て方。
 * Nano Banana 2.1 は考える量を保ったままサイズだけ組み替える。
 */
interface GeminiSizeContext {
  sizeTier: GeminiBananaSizeTier;
  sizeTiers: ReadonlyArray<GeminiBananaSizeTier>;
  compose: (sizeTier: GeminiBananaSizeTier) => GeminiModel | null;
  tooltipContentKey:
    | "geminiBanana2SizeTooltipContent"
    | "geminiBananaProSizeTooltipContent"
    | "nanoBanana21SizeTooltipContent";
}

function resolveGeminiSizeContext(value: GeminiModel): GeminiSizeContext | null {
  const nano21 = parseNanoBanana21Model(value);
  if (nano21) {
    return {
      sizeTier: nano21.sizeTier,
      sizeTiers: NANO_BANANA_2_1_SIZE_TIERS,
      compose: (sizeTier) =>
        (NANO_BANANA_2_1_SIZE_TIERS as ReadonlyArray<string>).includes(sizeTier)
          ? composeNanoBanana21Model(
              nano21.thinkingLevel,
              sizeTier as NanoBanana21SizeTier
            )
          : null,
      tooltipContentKey: "nanoBanana21SizeTooltipContent",
    };
  }
  const parsed = parseGeminiBananaModel(value);
  if (!parsed) {
    return null;
  }
  return {
    sizeTier: parsed.sizeTier,
    sizeTiers: getSizeTiersForFamily(parsed.family),
    compose: (sizeTier) => composeGeminiBananaModel(parsed.family, sizeTier),
    tooltipContentKey:
      parsed.family === "nano-2"
        ? "geminiBanana2SizeTooltipContent"
        : "geminiBananaProSizeTooltipContent",
  };
}

/**
 * Nano Banana 2 / 2.1 / Pro 選択時に表示する出力サイズセレクター。
 * `GptImage2SizeSelector` の Gemini 版で、モデルごとに許可される size tier
 * （nano-2: 0.5K/1K、nano-2.1: 1K/2K/4K、nano-pro: 1K/2K/4K）を描画する。
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
  const context = resolveGeminiSizeContext(value);

  if (!context) {
    return null;
  }

  const isGuest = authState === "guest";
  const { sizeTiers, tooltipContentKey } = context;

  const handleValueChange = (next: string) => {
    const nextSizeTier = next as GeminiBananaSizeTier;
    const nextModel = context.compose(nextSizeTier);
    if (!nextModel) {
      return;
    }
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
    <div className="space-y-3" data-tour="tour-gemini-banana-size">
      <div className="space-y-1">
        <Label className="mb-1 flex items-center gap-2 text-base font-medium">
          <span>{t("geminiBananaSizeLabel")}</span>
          <LabelInfoTooltip
            ariaLabel={t("geminiBananaSizeTooltipAria")}
            content={
              <span className="whitespace-pre-line">
                {t(tooltipContentKey)}
              </span>
            }
            contentClassName="max-w-[24rem] px-3 py-2 text-sm leading-6"
          />
        </Label>
        <p className="text-xs leading-5 text-gray-500">
          {t("geminiBananaSizeDescription")}
        </p>
      </div>
      <Select
        value={context.sizeTier}
        onValueChange={handleValueChange}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {sizeTiers.map((sizeTier) => {
            const optionModel = context.compose(sizeTier);
            // 型上 compose はモデルと size の不整合で null を返し得るが、
            // sizeTiers はそのモデル専用のリストなのでここでは常に non-null。
            if (!optionModel) {
              return null;
            }
            const isGuestLocked =
              isGuest && !isCanonicalGuestAllowedModel(optionModel);
            const isPlanLocked = !(isModelSelectable?.(optionModel) ?? true);
            const isLocked = isGuestLocked || isPlanLocked;
            // 選択肢は全モデル「名前：0.5K / 1K / 2K / 4K」で px を書かない。
            // px は縦横比で変わるので、説明の吹き出し(tooltipContentKey)にだけ書く
            const label = t(SIZE_LABEL_KEYS[sizeTier]);
            const optionContent = (
              <span className="flex w-full items-center">
                <span>{label}</span>
              </span>
            );
            return (
              <SelectItem
                key={sizeTier}
                value={sizeTier}
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
