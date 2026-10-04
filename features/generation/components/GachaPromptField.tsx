"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GachaSplitTool } from "./GachaSplitTool";
import {
  GACHA_CLOSE_TAG,
  GACHA_FIELD_TEMPLATE,
  GACHA_OPEN_TAG,
  type GachaFieldValidation,
} from "@/shared/generation/gacha-prompt";

interface GachaPromptFieldProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  value: string;
  onChange: (next: string) => void;
  /** 入力欄の判定結果。チェックが外れているときは null。 */
  validation: GachaFieldValidation | null;
  disabled?: boolean;
  /**
   * 「ガチャに分ける」道具。渡されたときだけ出す(公開前は運営だけ)。
   * prompt は今の本文、onApply は本文と候補欄の書き換え。
   */
  split?: {
    prompt: string;
    onApply: (body: string, field: string) => void;
    onProposalOpenChange?: (open: boolean) => void;
  };
  /** 「ガチャに分ける」の案を見せている間は、候補欄も書き換えさせない。 */
  fieldLocked?: boolean;
}

/**
 * 「ガチャプロンプトにする」のチェックと、候補を書く入力欄。
 *
 * 入力欄の中身は本文の末尾に付けて送り、生成のたびに Worker が
 * {{GACHA}} の候補から1つを選ぶ（shared/generation/gacha-prompt.ts）。
 */
export function GachaPromptField({
  enabled,
  onEnabledChange,
  value,
  onChange,
  validation,
  disabled = false,
  split,
  fieldLocked = false,
}: GachaPromptFieldProps) {
  const t = useTranslations("free");
  const errorMessage =
    validation && !validation.ok
      ? validation.reason === "missing_block"
        ? t("gachaMissingBlock", { open: GACHA_OPEN_TAG, close: GACHA_CLOSE_TAG })
        : t("gachaTooFewCandidates")
      : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center space-x-2">
        <Checkbox
          id="gacha-prompt-enabled"
          checked={enabled}
          onCheckedChange={(checked) => onEnabledChange(checked === true)}
          disabled={disabled}
        />
        <Label
          htmlFor="gacha-prompt-enabled"
          className="text-sm font-medium leading-none"
        >
          {t("gachaToggleLabel")}
        </Label>
      </div>

      {enabled ? (
        <div className="space-y-2 border-l-2 border-primary/40 pl-3">
          {split ? (
            <GachaSplitTool
              prompt={split.prompt}
              field={value}
              onApply={split.onApply}
              onProposalOpenChange={split.onProposalOpenChange}
              disabled={disabled}
            />
          ) : null}
          <Label htmlFor="gacha-prompt-field" className="text-sm font-medium">
            {t("gachaFieldLabel")}
          </Label>
          <Textarea
            id="gacha-prompt-field"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled || fieldLocked}
            rows={8}
            aria-invalid={errorMessage !== null}
            aria-describedby="gacha-prompt-hints"
            className="max-h-80 font-mono text-sm"
          />
          <ul
            id="gacha-prompt-hints"
            className="list-disc space-y-0.5 pl-5 text-xs text-gray-500"
          >
            <li>{t("gachaHintRandom")}</li>
            <li>{t("gachaHintPerCandidate")}</li>
            <li>{t("gachaHintBody")}</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() =>
                onChange(
                  `${GACHA_OPEN_TAG}\n${t("gachaExample")}\n${GACHA_CLOSE_TAG}`,
                )
              }
            >
              {t("gachaInsertExample")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => onChange(GACHA_FIELD_TEMPLATE)}
            >
              {t("gachaReset")}
            </Button>
          </div>
          <p
            className="text-xs text-red-600"
            aria-live="polite"
            data-testid="gacha-prompt-error"
          >
            {errorMessage}
          </p>
        </div>
      ) : null}
    </div>
  );
}
