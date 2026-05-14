"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  isCanonicalGuestAllowedModel,
  isModelAvailableForGeneration,
  resolveEffectiveModelForAuthState,
} from "@/features/generation/lib/model-config";
import {
  MODEL_TAG_DISPLAY,
  type ModelTagKey,
} from "@/features/generation/lib/model-tags";
import {
  composeGeminiBananaModel,
  composeGptImage2Model,
  getDefaultCanonicalForFamily,
  parseGeminiBananaModel,
  parseGptImage2Model,
  type GeminiBananaFamily,
  type GeminiBananaSizeTier,
  type GeminiModel,
  type GptImage2Quality,
  type GptImage2SizeTier,
} from "@/features/generation/types";

export type ModelSelectAuthState = "guest" | "authenticated";

export interface LockableModelSelectProps {
  /** ユーザーが選択したモデル ID。authState='guest' で非許可だった場合は表示上 clamp する */
  value: GeminiModel;
  /** 許可モデル選択時に呼ばれる。ロックモデルが選ばれた場合は呼ばれない */
  onChange: (next: GeminiModel) => void;
  /** ロックモデルがクリックされたときに呼ばれる（AuthModal を開く想定） */
  onLockedClick: () => void;
  authState: ModelSelectAuthState;
  disabled?: boolean;
  isModelSelectable?: (model: GeminiModel) => boolean;
}

interface ModelOption {
  value: string;
  /** OpenAI 系: ChatGPT Images 2.0 の quality */
  gptImage2Quality?: GptImage2Quality;
  /** Gemini 系: Nano Banana 2 / Pro の family */
  geminiBananaFamily?: GeminiBananaFamily;
  labelKey:
    | "modelGptImage2Low"
    | "modelGptImage2Medium"
    | "modelGptImage2High"
    | "modelNanoBanana2"
    | "modelNanoBananaPro";
  /** チップ表示で使う固定 tier。family レベルの目安なので size には依存させない。 */
  tierTag: ModelTagKey;
}

const MODEL_OPTIONS: ReadonlyArray<ModelOption> = [
  {
    value: "gpt-image-2-low-row",
    gptImage2Quality: "low",
    labelKey: "modelGptImage2Low",
    tierTag: "tierLight",
  },
  {
    value: "gpt-image-2-medium-row",
    gptImage2Quality: "medium",
    labelKey: "modelGptImage2Medium",
    tierTag: "tierBalanced",
  },
  {
    value: "gpt-image-2-high-row",
    gptImage2Quality: "high",
    labelKey: "modelGptImage2High",
    tierTag: "tierQuality",
  },
  {
    value: "nano-banana-2-row",
    geminiBananaFamily: "nano-2",
    labelKey: "modelNanoBanana2",
    tierTag: "tierLight",
  },
  {
    value: "nano-banana-pro-row",
    geminiBananaFamily: "nano-pro",
    labelKey: "modelNanoBananaPro",
    tierTag: "tierQuality",
  },
];

/**
 * モデル行（value）から、現在の size tier 状態を踏まえた canonical モデル ID を導出する。
 *
 * - OpenAI: `quality` × `currentGptImage2SizeTier` → `composeGptImage2Model`
 * - Gemini: `family` × `currentGeminiBananaSizeTier`。family と size の組み合わせが
 *   無効（例: Nano Banana Pro × 0.5K）の場合は family の既定 canonical に丸める。
 */
function toOptionCanonicalValue(
  option: ModelOption,
  currentGptImage2SizeTier: GptImage2SizeTier,
  currentGeminiBananaSizeTier: GeminiBananaSizeTier
): GeminiModel {
  if (option.gptImage2Quality) {
    return composeGptImage2Model(
      option.gptImage2Quality,
      currentGptImage2SizeTier
    );
  }
  if (option.geminiBananaFamily) {
    const composed = composeGeminiBananaModel(
      option.geminiBananaFamily,
      currentGeminiBananaSizeTier
    );
    return (composed ??
      getDefaultCanonicalForFamily(option.geminiBananaFamily)) as GeminiModel;
  }
  return option.value as GeminiModel;
}

/**
 * /style と /coordinate で共有するモデル選択 UI。
 *
 * - ChatGPT Images 2.0 (Low/Medium/High) と Nano Banana 2 / Pro の合計 5 行を並べる
 * - 解像度（size tier）は別カードの size selector（OpenAI 用 / Gemini 用）で選ぶ
 * - `authState='guest'` のとき、`GUEST_ALLOWED_MODELS` 以外には南京錠アイコンを付ける
 * - ロックモデルをクリックしても `value` は変えず、`onLockedClick` を呼ぶ
 *   （AuthModal を開くハンドラを親が渡す）
 * - localStorage に保存された値が許可外でも表示値は `DEFAULT_GENERATION_MODEL` に丸める
 *
 * 関連: 計画書 ADR-006 / Phase 4
 */
export function LockableModelSelect(props: LockableModelSelectProps) {
  const t = useTranslations("coordinate");
  const isGuest = props.authState === "guest";
  const isModelSelectable = props.isModelSelectable;

  // 表示値の clamp: ゲストのまま許可外モデルが渡されたら表示上は既定モデル扱い
  const displayModel = resolveEffectiveModelForAuthState(
    props.value,
    props.authState
  );
  const parsedGptImage2 = parseGptImage2Model(displayModel);
  const parsedGeminiBanana = parseGeminiBananaModel(displayModel);
  const currentGptImage2SizeTier: GptImage2SizeTier =
    parsedGptImage2?.sizeTier ?? "1k";
  const currentGeminiBananaSizeTier: GeminiBananaSizeTier =
    parsedGeminiBanana?.sizeTier ?? "1k";

  const displayValue = parsedGptImage2
    ? `gpt-image-2-${parsedGptImage2.quality}-row`
    : parsedGeminiBanana
      ? parsedGeminiBanana.family === "nano-2"
        ? "nano-banana-2-row"
        : "nano-banana-pro-row"
      : displayModel;

  const availableModelOptions = useMemo(
    () =>
      MODEL_OPTIONS.filter((option) => {
        const canonical = toOptionCanonicalValue(
          option,
          currentGptImage2SizeTier,
          currentGeminiBananaSizeTier
        );
        return (
          isModelAvailableForGeneration(canonical) &&
          (isModelSelectable?.(canonical) ?? true)
        );
      }),
    [currentGptImage2SizeTier, currentGeminiBananaSizeTier, isModelSelectable]
  );

  const handleValueChange = (next: string) => {
    const option = availableModelOptions.find((item) => item.value === next);
    if (!option) {
      return;
    }
    const nextModel = toOptionCanonicalValue(
      option,
      currentGptImage2SizeTier,
      currentGeminiBananaSizeTier
    );
    if (!isModelAvailableForGeneration(nextModel)) {
      return;
    }
    if (!(isModelSelectable?.(nextModel) ?? true)) {
      return;
    }
    if (isGuest && !isCanonicalGuestAllowedModel(nextModel)) {
      // ロック行クリック: 値は変えず、AuthModal を呼ぶだけ
      props.onLockedClick();
      return;
    }
    props.onChange(nextModel);
  };

  /**
   * モデル行の表示内容。モデル名（i18n ラベル）はそのままに、品質ポジションを
   * 示す色付きチップ（Low/Medium/High）を後ろに添える。チップは行固有の `tierTag`
   * を使い、現在の size tier では変化しない（行の意味＝family/quality 自体は変わらないため）。
   * トリガー（SelectValue）にも同じ内容が複製表示されるが、shadcn の select-value は
   * flex 行を想定しているので問題ない。単一の `<span>` でラベルテキストを包んでいるため、
   * `getByText("...モデル名")` でも拾える。
   */
  const renderModelOptionContent = (
    option: ModelOption,
    { withLockIcon = false }: { withLockIcon?: boolean } = {}
  ) => {
    const display = MODEL_TAG_DISPLAY[option.tierTag];
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        {withLockIcon ? (
          <Lock className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
        ) : null}
        <span>{t(option.labelKey)}</span>
        <Badge
          className={cn(
            "px-1.5 py-0 text-[10px] leading-4 font-medium",
            display.className
          )}
        >
          {t(display.messageKey)}
        </Badge>
      </span>
    );
  };

  return (
    <Select
      value={displayValue}
      onValueChange={handleValueChange}
      disabled={props.disabled || availableModelOptions.length <= 1}
    >
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {availableModelOptions.map((option) => {
          const optionModel = toOptionCanonicalValue(
            option,
            currentGptImage2SizeTier,
            currentGeminiBananaSizeTier
          );
          const isLocked = isGuest && !isCanonicalGuestAllowedModel(optionModel);
          if (isLocked) {
            return (
              <SelectItem
                key={option.value}
                value={option.value}
                aria-disabled
                aria-haspopup="dialog"
                data-locked
              >
                {renderModelOptionContent(option, { withLockIcon: true })}
              </SelectItem>
            );
          }
          return (
            <SelectItem key={option.value} value={option.value}>
              {renderModelOptionContent(option)}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
