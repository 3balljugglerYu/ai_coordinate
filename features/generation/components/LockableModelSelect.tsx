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
  getModelTagsForCanonicalModel,
} from "@/features/generation/lib/model-tags";
import {
  composeGptImage2Model,
  parseGptImage2Model,
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
  gptImage2Quality?: GptImage2Quality;
  labelKey:
    | "modelLight05k"
    | "modelGptImage2Low"
    | "modelGptImage2Medium"
    | "modelGptImage2High"
    | "modelStandard1k"
    | "modelPro1k"
    | "modelPro2k"
    | "modelPro4k";
}

const MODEL_OPTIONS: ReadonlyArray<ModelOption> = [
  {
    value: "gpt-image-2-low-row",
    gptImage2Quality: "low",
    labelKey: "modelGptImage2Low",
  },
  {
    value: "gpt-image-2-medium-row",
    gptImage2Quality: "medium",
    labelKey: "modelGptImage2Medium",
  },
  {
    value: "gpt-image-2-high-row",
    gptImage2Quality: "high",
    labelKey: "modelGptImage2High",
  },
  { value: "gemini-3.1-flash-image-preview-512", labelKey: "modelLight05k" },
  { value: "gemini-3.1-flash-image-preview-1024", labelKey: "modelStandard1k" },
  { value: "gemini-3-pro-image-1k", labelKey: "modelPro1k" },
  { value: "gemini-3-pro-image-2k", labelKey: "modelPro2k" },
  { value: "gemini-3-pro-image-4k", labelKey: "modelPro4k" },
];

function toOptionCanonicalValue(
  option: ModelOption,
  currentSizeTier: GptImage2SizeTier
): GeminiModel {
  if (option.gptImage2Quality) {
    return composeGptImage2Model(option.gptImage2Quality, currentSizeTier);
  }
  return option.value as GeminiModel;
}

/**
 * /style と /coordinate で共有するモデル選択 UI。
 *
 * - GPT Image 2 の品質 3 行と Gemini 5 行を Select で並べる
 * - `authState='guest'` のとき、`GUEST_ALLOWED_MODELS` 以外には南京錠アイコンを付ける
 * - ロックモデルをクリックしても `value` は変えず、`onLockedClick` を呼ぶ
 *   （AuthModal を開くハンドラを親が渡す）
 * - localStorage に保存された値が許可外（例: ログイン後に Pro 系を選んでログアウト）でも
 *   表示値は `DEFAULT_GENERATION_MODEL` に丸める。保存値は親が決める（UCL-015 / ADR-004）
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
  const currentSizeTier = parsedGptImage2?.sizeTier ?? "1k";
  const displayValue = parsedGptImage2
    ? `gpt-image-2-${parsedGptImage2.quality}-row`
    : displayModel;
  const availableModelOptions = useMemo(
    () =>
      MODEL_OPTIONS.filter((option) => {
        const canonical = toOptionCanonicalValue(option, currentSizeTier);
        return (
          isModelAvailableForGeneration(canonical) &&
          (isModelSelectable?.(canonical) ?? true)
        );
      }),
    [currentSizeTier, isModelSelectable]
  );

  const handleValueChange = (next: string) => {
    const option = availableModelOptions.find((item) => item.value === next);
    if (!option) {
      return;
    }
    const nextModel = toOptionCanonicalValue(option, currentSizeTier);
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
   * モデル行の表示内容。モデル名（i18n ラベル）はそのままに、エンジン / 価格・品質
   * ポジションを示す小さなチップを後ろに添える。トリガー（SelectValue）にも
   * 同じ内容が複製表示されるが、shadcn の select-value は flex 行を想定しているので問題ない。
   * 単一の `<span>` でラベルテキストを包んでいるため、`getByText("...モデル名")` でも拾える。
   */
  const renderModelOptionContent = (
    option: ModelOption,
    canonicalModel: GeminiModel,
    { withLockIcon = false }: { withLockIcon?: boolean } = {}
  ) => {
    const tags = getModelTagsForCanonicalModel(canonicalModel);
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        {withLockIcon ? (
          <Lock className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
        ) : null}
        <span>{t(option.labelKey)}</span>
        {tags.map((tag) => {
          const display = MODEL_TAG_DISPLAY[tag];
          return (
            <Badge
              key={tag}
              className={cn(
                "px-1.5 py-0 text-[10px] leading-4 font-medium",
                display.className
              )}
            >
              {t(display.messageKey)}
            </Badge>
          );
        })}
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
          const optionModel = toOptionCanonicalValue(option, currentSizeTier);
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
                {renderModelOptionContent(option, optionModel, {
                  withLockIcon: true,
                })}
              </SelectItem>
            );
          }
          return (
            <SelectItem key={option.value} value={option.value}>
              {renderModelOptionContent(option, optionModel)}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
