"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { NameTextInput } from "./NameTextInput";
import {
  checkNameInputValue,
  NAME_INPUT_MAX_LENGTH,
  type NameInputForUsers,
} from "@/shared/generation/name-input";

interface NameInputEntryFieldProps {
  slot: NameInputForUsers;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * カタログから使う人が名前を入れる欄(生成シートの、画像の下。2026-10-06 ユーザー決定)。
 * 見出し・入力例・必須かどうかは作る人が決めたもの(本文は届かない)。
 */
export function NameInputEntryField({ slot, value, onChange, disabled = false }: NameInputEntryFieldProps) {
  const t = useTranslations("free");
  // 空欄の赤字は欄から離れてから出す(ガチャの欄と同じ作法)。長すぎ・使えない文字は打った時点で出す
  // (超えた分を欄の中で赤くするのと合わせる。2026-10-07 ユーザー指示)
  const [touched, setTouched] = useState(false);
  const check = checkNameInputValue(value);
  const errorMessage = !check.ok
    ? check.reason === "too_long"
      ? t("nameInputTooLong", { max: NAME_INPUT_MAX_LENGTH })
      : t("nameInputInvalidCharacters")
    : slot.required && !check.value
      ? t("nameInputRequiredMissing")
      : null;
  const showAsError = errorMessage !== null && (touched || !check.ok);

  return (
    <div className="space-y-1" data-testid="name-input-entry">
      <Label htmlFor="name-input-entry" className="text-base font-medium block">
        {slot.required ? slot.label : t("nameInputEntryOptionalLabel", { label: slot.label })}
      </Label>
      <NameTextInput
        id="name-input-entry"
        value={value}
        disabled={disabled}
        placeholder={slot.placeholder ?? ""}
        onValueChange={onChange}
        onBlur={() => setTouched(true)}
        aria-invalid={showAsError}
        aria-describedby="name-input-entry-hint"
      />
      <p
        id="name-input-entry-hint"
        className={cn("text-xs", showAsError ? "text-red-600" : "text-gray-500")}
        data-testid="name-input-entry-hint"
        data-tone={showAsError ? "error" : "hint"}
      >
        {errorMessage ??
          (slot.required
            ? t("nameInputEntryRequiredHint", { max: NAME_INPUT_MAX_LENGTH })
            : t("nameInputTrialHint", { max: NAME_INPUT_MAX_LENGTH }))}
      </p>
    </div>
  );
}
