"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { NameInputCreateTool } from "./NameInputCreateTool";
import { NameTextInput } from "./NameTextInput";
import {
  buildNameInputMarker,
  checkNameInputValue,
  NAME_INPUT_INITIAL_LABEL,
  NAME_INPUT_MAX_LENGTH,
  NAME_INPUT_MAX_SLOTS,
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
  /**
   * 「本文から名前の欄を作る」道具(運営だけの段階公開。無ければ出さない)。
   * 本文の名前に関する行を、目印1つにまとめる。
   */
  createTool?: {
    prompt: string;
    onApply: (body: string) => void;
    onProposalOpenChange?: (open: boolean) => void;
  };
  disabled?: boolean;
}

/**
 * 「名前を入れられるようにする」(docs/planning/name-input-slot-plan.md)。
 *
 * スイッチのオン・オフは本文の目印 `{{INPUT:見出し}}` の有無そのもの(状態を二重に持たない)。
 * 作る人が本文に目印を手で書いても、ここがオンになる。
 *
 * 見出し・入力例・任意/必須は既定のまま(作る人は変えられない。サブスクでできることにする構想。
 * 2026-10-07 ユーザー決定)。名前だけを扱い、いつも任意(空欄でも生成できる)。
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
  createTool,
  disabled = false,
}: NamePromptFieldProps) {
  const t = useTranslations("free");
  const enabled = slot !== null;
  // スイッチを切る前の目印(本文に手で書いた見出しなど)。オンに戻したら元どおりにする(2026-10-07 ユーザー指示)
  const [savedSlot, setSavedSlot] = useState<NameInputSlot | null>(null);
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
  // 長すぎ・使えない文字は打った時点で出す(超えた分を欄の中で赤くするのと合わせる)
  const showAsError = errorMessage !== null && (touched || !check.ok);

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
          <p className="text-xs text-gray-500" data-testid="name-input-marker-hint">
            {t("nameInputMarkerHint", { marker: buildNameInputMarker(slot) })}
          </p>
          {createTool ? (
            <NameInputCreateTool
              prompt={createTool.prompt}
              slot={slot}
              onApply={createTool.onApply}
              onProposalOpenChange={createTool.onProposalOpenChange}
              disabled={disabled}
            />
          ) : null}
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
            <NameTextInput
              id="name-input-trial"
              value={trialName}
              disabled={disabled}
              placeholder={slot?.placeholder ?? ""}
              onValueChange={onTrialNameChange}
              onBlur={() => setTouched(true)}
              aria-invalid={showAsError}
              aria-describedby="name-input-trial-hint"
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
