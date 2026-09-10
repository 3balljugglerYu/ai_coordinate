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
import { useGptImage25Available } from "@/features/generation/components/GptImage25AvailabilityProvider";
import {
  GEMINI_BANANA_2_SIZE_TIERS,
  GEMINI_BANANA_PRO_SIZE_TIERS,
  GPT_IMAGE_2_SIZE_TIERS,
  composeGeminiBananaModel,
  composeOpenAIImageModel,
  parseGeminiBananaModel,
  parseOpenAIImageModel,
  type GeminiBanana2SizeTier,
  type GeminiBananaProSizeTier,
  type GeminiBananaSizeTier,
  type GeminiModel,
  type GptImage2SizeTier,
} from "@/features/generation/types";

export type ModelSelectAuthState = "guest" | "authenticated";

/**
 * ChatGPT Images 2.5 に「NEW」バッジを出す期限(JST 2026-09-30 23:59:59)。
 *
 * 告知バナー(2026-09-11 05:20 〜 09-30 05:20 JST)より少しだけ長く残し、
 * バナーを見ずに来た人にも新しさが伝わるようにする。期限を過ぎたら
 * 何も設定を触らなくてもバッジは消える(DB も管理画面も持たない)。
 */
const GPT_IMAGE_2_5_NEW_BADGE_UNTIL = Date.parse("2026-09-30T14:59:59Z");

function isWithinNewBadgePeriod(now: number = Date.now()): boolean {
  return now <= GPT_IMAGE_2_5_NEW_BADGE_UNTIL;
}

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

type ModelRowValue =
  | "gpt-image-2-row"
  | "gpt-image-2.5-flare-row"
  | "nano-banana-2-row"
  | "nano-banana-pro-row";

interface ModelOption {
  value: ModelRowValue;
  labelKey:
    | "modelChatGptImages"
    | "modelChatGptImages25"
    | "modelNanoBanana2"
    | "modelNanoBananaPro";
  /** 行に添えるエンジンチップ */
  engineTag: ModelTagKey;
}

const MODEL_OPTIONS: ReadonlyArray<ModelOption> = [
  // 2.5 を先頭に置く。全公開後は 2.5 を既定にする想定のため、
  // 検証中から並びを最終形に合わせておく(既定モデル自体はまだ 2.0)。
  {
    value: "gpt-image-2.5-flare-row",
    labelKey: "modelChatGptImages25",
    engineTag: "engineOpenai",
  },
  {
    value: "gpt-image-2-row",
    labelKey: "modelChatGptImages",
    engineTag: "engineOpenai",
  },
  {
    value: "nano-banana-2-row",
    labelKey: "modelNanoBanana2",
    engineTag: "engineGemini",
  },
  {
    value: "nano-banana-pro-row",
    labelKey: "modelNanoBananaPro",
    engineTag: "engineGemini",
  },
];

function isGptImage2Size(
  size: string | null | undefined
): size is GptImage2SizeTier {
  return (
    typeof size === "string" &&
    (GPT_IMAGE_2_SIZE_TIERS as ReadonlyArray<string>).includes(size)
  );
}

function isGeminiBanana2Size(
  size: string | null | undefined
): size is GeminiBanana2SizeTier {
  return (
    typeof size === "string" &&
    (GEMINI_BANANA_2_SIZE_TIERS as ReadonlyArray<string>).includes(size)
  );
}

function isGeminiBananaProSize(
  size: string | null | undefined
): size is GeminiBananaProSizeTier {
  return (
    typeof size === "string" &&
    (GEMINI_BANANA_PRO_SIZE_TIERS as ReadonlyArray<string>).includes(size)
  );
}

/**
 * 行クリック時の遷移ルール:
 *   - 同じファミリーをクリック: 現在のモデルをそのまま返す（quality / size を維持）
 *   - 別ファミリーをクリック: 現在の size が新ファミリーで有効なら維持、無効なら 1K
 *     にフォールバック。新ファミリーの quality は既定（OpenAI なら low）
 */
function toOptionCanonicalValue(
  option: ModelOption,
  currentModel: GeminiModel
): GeminiModel {
  const parsedOpenAI = parseOpenAIImageModel(currentModel);
  const parsedGeminiBanana = parseGeminiBananaModel(currentModel);
  const currentSize: GptImage2SizeTier | GeminiBananaSizeTier =
    parsedOpenAI?.sizeTier ?? parsedGeminiBanana?.sizeTier ?? "1k";

  if (option.value === "gpt-image-2-row") {
    // この行は family `gpt-image-2` 専用（2.5 は別行）
    if (parsedOpenAI?.family === "gpt-image-2") return currentModel;
    const size = isGptImage2Size(currentSize) ? currentSize : "1k";
    return composeOpenAIImageModel("gpt-image-2", "low", size);
  }
  if (option.value === "gpt-image-2.5-flare-row") {
    // size tier は 2.0 と共通（GPT_IMAGE_2_TIER_LIMITS）なのでそのまま維持できる
    if (parsedOpenAI?.family === "gpt-image-2.5-flare") return currentModel;
    const size = isGptImage2Size(currentSize) ? currentSize : "1k";
    return composeOpenAIImageModel("gpt-image-2.5-flare", "low", size);
  }
  if (option.value === "nano-banana-2-row") {
    if (parsedGeminiBanana?.family === "nano-2") return currentModel;
    const size = isGeminiBanana2Size(currentSize) ? currentSize : "1k";
    const composed = composeGeminiBananaModel("nano-2", size);
    return (composed ?? "gemini-3.1-flash-image-preview-1024") as GeminiModel;
  }
  // nano-banana-pro-row
  if (parsedGeminiBanana?.family === "nano-pro") return currentModel;
  const size = isGeminiBananaProSize(currentSize) ? currentSize : "1k";
  const composed = composeGeminiBananaModel("nano-pro", size);
  return (composed ?? "gemini-3-pro-image-1k") as GeminiModel;
}

/**
 * canonical モデルから「今選択中の 1 段目行」を導出する。
 */
function getCurrentRowValue(model: GeminiModel): ModelRowValue | null {
  const openAIFamily = parseOpenAIImageModel(model)?.family;
  if (openAIFamily === "gpt-image-2") return "gpt-image-2-row";
  if (openAIFamily === "gpt-image-2.5-flare") return "gpt-image-2.5-flare-row";
  const parsed = parseGeminiBananaModel(model);
  if (parsed?.family === "nano-2") return "nano-banana-2-row";
  if (parsed?.family === "nano-pro") return "nano-banana-pro-row";
  return null;
}

/**
 * /style と /coordinate で共有する 1 段目の「生成モデル」セレクター。
 *
 * 3 行（ChatGPT Images 2.0 / Nano Banana 2 / Nano Banana Pro）でファミリーを切り替える。
 * 段階公開中の ChatGPT Images 2.5 は、運営（`useGptImage25Available()` が true）にだけ
 * **先頭行**として現れる（全公開後に既定へ据える想定の並び）。
 * 行クリック時、現在の size が新ファミリーで有効なら維持、無効なら 1K へフォールバック。
 * Quality（Low/Medium/High）は別カードの `GptImage2QualitySelector` で、size は
 * `GptImage2SizeSelector` / `GeminiBananaSizeSelector` でそれぞれ選ぶ。
 *
 * `authState='guest'` のとき `GUEST_ALLOWED_MODELS` 以外には南京錠アイコンを付ける。
 */
export function LockableModelSelect(props: LockableModelSelectProps) {
  const t = useTranslations("coordinate");
  const isGuest = props.authState === "guest";
  const isModelSelectable = props.isModelSelectable;

  // ChatGPT Images 2.5 は段階公開中(REQ-014)。運営以外は表示上も既定モデルへ丸める。
  const gptImage25Available = useGptImage25Available();
  // NEW バッジは「2.5 を選べる人」にだけ、期間内だけ出す。
  // useMemo ではなくレンダー毎の評価で十分(Date.now() の比較のみ)。
  const showNewBadge = gptImage25Available && isWithinNewBadgePeriod();
  const displayModel = resolveEffectiveModelForAuthState(
    props.value,
    props.authState,
    { gptImage25Available }
  );
  const displayValue: ModelRowValue | string =
    getCurrentRowValue(displayModel) ?? displayModel;

  // free プランで isModelSelectable が false のオプションも候補に残し、
  // 南京錠表示＋クリックで onLockedClick を発火させる。kill switch 等で
  // 完全に利用不能なモデル（isModelAvailableForGeneration === false）だけは除外する。
  const availableModelOptions = useMemo(
    () =>
      MODEL_OPTIONS.filter((option) => {
        // ChatGPT Images 2.5 は段階公開中。運営（またはフラグ ON）以外には
        // 行そのものを出さない（REQ-001 / REQ-002）。
        if (
          option.value === "gpt-image-2.5-flare-row" &&
          !gptImage25Available
        ) {
          return false;
        }
        const canonical = toOptionCanonicalValue(option, displayModel);
        return isModelAvailableForGeneration(canonical);
      }),
    [displayModel, gptImage25Available]
  );

  const handleValueChange = (next: string) => {
    const option = availableModelOptions.find((item) => item.value === next);
    if (!option) {
      return;
    }
    const nextModel = toOptionCanonicalValue(option, displayModel);
    if (!isModelAvailableForGeneration(nextModel)) {
      return;
    }
    const isGuestLocked = isGuest && !isCanonicalGuestAllowedModel(nextModel);
    const isPlanLocked = !(isModelSelectable?.(nextModel) ?? true);
    if (isGuestLocked || isPlanLocked) {
      props.onLockedClick();
      return;
    }
    props.onChange(nextModel);
  };

  /**
   * モデル行の表示内容。モデル名 + エンジンチップ（OpenAI / Gemini）。
   * トリガー（SelectValue）にも同じ内容が複製表示されるが、shadcn の select-value は
   * flex 行を想定しているので問題ない。単一の `<span>` でラベルテキストを包んでいるため、
   * `getByText("...モデル名")` でも拾える。
   */
  const renderModelOptionContent = (
    option: ModelOption,
    { withLockIcon = false }: { withLockIcon?: boolean } = {}
  ) => {
    const display = MODEL_TAG_DISPLAY[option.engineTag];
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
        {option.value === "gpt-image-2.5-flare-row" && showNewBadge ? (
          // ホームの新着バッジ(StylePresetPreviewCard / NewPromptBadge)と同じ意匠。
          // Badge コンポーネントではなく span なのは、グラデーションを
          // default variant の背景色に潰されないようにするため。
          <span className="pointer-events-none inline-flex items-center rounded-full bg-gradient-to-r from-pink-500 to-orange-400 px-2 py-0.5 text-[10px] font-bold leading-tight text-white shadow">
            {t("modelNewBadge")}
          </span>
        ) : null}
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
          const optionModel = toOptionCanonicalValue(option, displayModel);
          const isGuestLocked =
            isGuest && !isCanonicalGuestAllowedModel(optionModel);
          const isPlanLocked = !(isModelSelectable?.(optionModel) ?? true);
          const isLocked = isGuestLocked || isPlanLocked;
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
