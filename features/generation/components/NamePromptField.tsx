"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { NameInputCreateTool } from "./NameInputCreateTool";
import { NameTextInput } from "./NameTextInput";
import {
  buildNameInputMarker,
  checkNameInputValue,
  NAME_INPUT_DEFAULT_LABEL,
  NAME_INPUT_HINT_MAX_LENGTH,
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
  /** 試しの欄の見出し(使う人・AI に届くものと同じ。無ければ本文の目印から)。 */
  trialLabel?: string;
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

/** 目印に書けない文字(波かっこ・縦棒・改行)。前後の空白は打っている途中なので残す。 */
function stripMarkerCharacters(value: string): string {
  return value.replace(/[{}|\r\n]/g, "");
}

/**
 * 見出し・入力例の欄は、打っている途中の文字(空白など)をそのまま持つ。
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
 * 画面では「文字入力を受け付ける」。名前に限らず、好きな文字を入れてもらえる(2026-10-07 ユーザー決定)。
 * - 見出し・入力例は、作る人が決められる(全員。何の文字を入れてほしいかは見出しで伝わる)
 * - 任意/必須はいつも任意(必須・8文字より長くするのはサブスクでできることにする構想)
 */
export function NamePromptField({
  slot,
  onSlotChange,
  onDisable,
  trialName,
  onTrialNameChange,
  hasReachableSlot,
  trialLabel,
  requiredGuaranteed,
  tooManySlots,
  createTool,
  disabled = false,
}: NamePromptFieldProps) {
  const t = useTranslations("free");
  const enabled = slot !== null;
  // スイッチを切る前の目印(本文に手で書いた見出しなど)。オンに戻したら元どおりにする(2026-10-07 ユーザー指示)
  const [savedSlot, setSavedSlot] = useState<NameInputSlot | null>(null);
  const [labelDraft, setLabelDraft] = useMarkerTextDraft(slot?.label ?? "");
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
              // ラベルは空から始める(何を入れてもらうかを作る人が決める。2026-10-07 ユーザー決定 案A)。
              // 空のままなら「名前」として扱う(使う人の欄・AI への固定文とも)
              onSlotChange(savedSlot ?? { label: "", required: false });
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
            <Label htmlFor="name-input-label" className="text-xs font-medium">
              {t("nameInputLabelSetting")}
            </Label>
            <Input
              id="name-input-label"
              value={labelDraft}
              maxLength={NAME_INPUT_LABEL_MAX_LENGTH}
              disabled={disabled}
              placeholder={t("nameInputLabelExample")}
              onChange={(event) => {
                // 目印に書けない文字(波かっこ・縦棒・改行)は、打った時点で外す(欄と目印を食い違わせない)
                const next = stripMarkerCharacters(event.target.value);
                setLabelDraft(next);
                onSlotChange({ ...slot, label: next });
              }}
              aria-describedby="name-input-label-help"
              className="text-base md:text-sm"
            />
            <p id="name-input-label-help" className="text-xs text-gray-500">
              {t("nameInputLabelHelp")}
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="name-input-placeholder" className="text-xs font-medium">
              {t("nameInputPlaceholderSetting")}
            </Label>
            <Input
              id="name-input-placeholder"
              value={placeholderDraft}
              maxLength={NAME_INPUT_HINT_MAX_LENGTH}
              disabled={disabled}
              placeholder={t("nameInputPlaceholderExample")}
              onChange={(event) => {
                const next = stripMarkerCharacters(event.target.value);
                setPlaceholderDraft(next);
                onSlotChange({ ...slot, placeholder: next || undefined });
              }}
              aria-describedby="name-input-placeholder-help"
              className="text-base md:text-sm"
            />
            {/* 「入力例」だけでは伝わらないので、何のことかを書き添える(2026-10-07 ユーザー指示) */}
            <p id="name-input-placeholder-help" className="text-xs text-gray-500">
              {t("nameInputPlaceholderHelp")}
            </p>
          </div>
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
              {t("nameInputTrialLabel", {
                label: trialLabel || slot?.label || NAME_INPUT_DEFAULT_LABEL,
              })}
            </Label>
            <NameTextInput
              id="name-input-trial"
              value={trialName}
              disabled={disabled}
              // 入力のヒントは「例：」を付けて見せる(使う人の欄と同じ)
              placeholder={slot?.placeholder ? t("nameInputHintDisplay", { hint: slot.placeholder }) : ""}
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
