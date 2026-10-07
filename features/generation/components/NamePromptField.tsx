"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  buildNameInputMarker,
  checkNameInputValue,
  NAME_INPUT_INITIAL_LABEL,
  NAME_INPUT_LABEL_MAX_LENGTH,
  NAME_INPUT_MAX_LENGTH,
  NAME_INPUT_MAX_SLOTS,
  normalizeNameInputMarkerText,
  type NameInputSlot,
} from "@/shared/generation/name-input";

interface NamePromptFieldProps {
  /** 本文にある名前の欄(最初の1つ)。無ければ null = スイッチはオフ。 */
  slot: NameInputSlot | null;
  /** スイッチを入れた(設定を変えた)とき。本文の目印を書き換える。 */
  onSlotChange: (slot: NameInputSlot) => void;
  /** スイッチを切ったとき。本文の目印を取り除く。 */
  onDisable: () => void;
  /** 作る人が自分の生成で試す名前。 */
  trialName: string;
  onTrialNameChange: (value: string) => void;
  /**
   * 送る文(本文＋ガチャの欄)に、AI に届く名前の欄があるか。本文に目印が無くても、
   * ガチャの欄に書いてあれば試しの名前を入れられるようにする(サーバーと同じ数え方)。
   */
  hasReachableSlot: boolean;
  /** 必ず届く必須の欄があるか(サーバーの hasGuaranteedRequiredNameInput と同じ)。 */
  requiredGuaranteed: boolean;
  /** 名前の欄が上限を超えているか(一般の利用者は1つまで。サーバーでも止める)。 */
  tooManySlots: boolean;
  disabled?: boolean;
}

/**
 * 入力例の欄は、打っている途中の文字(空白など)をそのまま持つ。
 * 本文の目印は前後の空白を落とすので、目印から読み戻すと空白が打てなくなるため。
 * 本文の目印が外から変わったとき(手で書き換えたなど)だけ、目印の値に合わせ直す。
 */
function useMarkerTextDraft(markerValue: string) {
  const [draft, setDraft] = useState(markerValue);
  const [seenMarkerValue, setSeenMarkerValue] = useState(markerValue);
  // 描画中に合わせ直す(effect で setState しない。React の「前の値と比べて state を直す」作法)
  if (seenMarkerValue !== markerValue) {
    setSeenMarkerValue(markerValue);
    if (normalizeNameInputMarkerText(draft) !== markerValue) setDraft(markerValue);
  }
  return [draft, setDraft] as const;
}

/**
 * 「名前を入れられるようにする」(docs/planning/name-input-slot-plan.md)。
 *
 * スイッチのオン・オフは本文の目印 `{{INPUT:見出し}}` の有無そのもの(状態を二重に持たない)。
 * 作る人が本文に目印を手で書いても、ここがオンになる。
 *
 * 見出しは既定のまま(作る人は変えられない。見出しの編集はサブスクでできることにする構想。
 * 2026-10-07 ユーザー決定)。名前だけを扱う。
 */
export function NamePromptField({
  slot,
  onSlotChange,
  onDisable,
  trialName,
  onTrialNameChange,
  hasReachableSlot,
  requiredGuaranteed,
  tooManySlots,
  disabled = false,
}: NamePromptFieldProps) {
  const t = useTranslations("free");
  const enabled = slot !== null;
  // スイッチを切る前の設定(入力例・任意/必須)。オンに戻したら元どおりにする(2026-10-07 ユーザー指示)
  const [savedSlot, setSavedSlot] = useState<NameInputSlot | null>(null);
  const [placeholderDraft, setPlaceholderDraft] = useMarkerTextDraft(slot?.placeholder ?? "");
  // 赤字は欄から離れてから出す(ガチャの欄と同じ作法。#690)
  const [touched, setTouched] = useState(false);
  const check = checkNameInputValue(trialName);
  const errorMessage = !check.ok
    ? check.reason === "too_long"
      ? t("nameInputTooLong", { max: NAME_INPUT_MAX_LENGTH })
      : t("nameInputInvalidCharacters")
    : requiredGuaranteed && !check.value
      ? t("nameInputRequiredMissing")
      : null;
  const showAsError = errorMessage !== null && touched;

  return (
    <div className="space-y-3" data-testid="name-prompt-field">
      <div className="flex items-center gap-2">
        <Label htmlFor="name-input-enabled" className="flex-1 text-sm font-medium leading-snug">
          {t("nameInputToggleLabel")}
        </Label>
        <Switch
          id="name-input-enabled"
          checked={enabled}
          disabled={disabled}
          onCheckedChange={(checked) => {
            setTouched(false);
            if (checked) {
              onSlotChange(
                savedSlot ?? { label: t("nameInputDefaultLabel") || NAME_INPUT_INITIAL_LABEL, required: false },
              );
            } else {
              setSavedSlot(slot);
              onDisable();
            }
          }}
        />
      </div>

      {slot ? (
        <div className="space-y-3 border-l-2 border-pink-400 pl-3">
          <div className="space-y-1">
            <Label htmlFor="name-input-placeholder" className="text-xs font-medium">
              {t("nameInputPlaceholderSetting")}
            </Label>
            <Input
              id="name-input-placeholder"
              value={placeholderDraft}
              maxLength={NAME_INPUT_LABEL_MAX_LENGTH}
              disabled={disabled}
              placeholder={t("nameInputPlaceholderExample")}
              onChange={(event) => {
                setPlaceholderDraft(event.target.value);
                onSlotChange({ ...slot, placeholder: event.target.value || undefined });
              }}
              className="text-base md:text-sm"
            />
          </div>
          <div className="space-y-1" role="group" aria-labelledby="name-input-required-label">
            <span id="name-input-required-label" className="text-xs font-medium">
              {t("nameInputRequiredSetting")}
            </span>
            <div className="flex gap-2">
              {([false, true] as const).map((required) => (
                <button
                  key={String(required)}
                  type="button"
                  aria-pressed={slot.required === required}
                  disabled={disabled}
                  onClick={() => onSlotChange({ ...slot, required })}
                  className={cn(
                    "flex-1 rounded-md border px-2 py-1.5 text-xs font-medium",
                    slot.required === required
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-900",
                  )}
                >
                  {required ? t("nameInputRequiredOption") : t("nameInputOptionalOption")}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-gray-500" data-testid="name-input-marker-hint">
            {t("nameInputMarkerHint", { marker: buildNameInputMarker(slot) })}
          </p>
        </div>
      ) : null}

      {tooManySlots ? (
        <p className="text-xs text-red-600" role="alert" data-testid="name-input-too-many">
          {t("nameInputTooManySlots", { max: NAME_INPUT_MAX_SLOTS })}
        </p>
      ) : null}

      {hasReachableSlot ? (
        <div className="border-l-2 border-pink-400 pl-3">
          <div className="space-y-1">
            <Label htmlFor="name-input-trial" className="text-xs font-medium">
              {t("nameInputTrialLabel")}
            </Label>
            <Input
              id="name-input-trial"
              value={trialName}
              disabled={disabled}
              placeholder={slot?.placeholder ?? ""}
              onChange={(event) => onTrialNameChange(event.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={showAsError}
              aria-describedby="name-input-trial-hint"
              className="text-base md:text-sm"
            />
            <p
              id="name-input-trial-hint"
              className={cn("text-xs", showAsError ? "text-red-600" : "text-gray-500")}
              data-testid="name-input-trial-hint"
              data-tone={showAsError ? "error" : "hint"}
            >
              {errorMessage ?? t("nameInputTrialHint", { max: NAME_INPUT_MAX_LENGTH })}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
