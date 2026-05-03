"use client";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { InspireOverrideTarget } from "@/features/generation/types";

/**
 * inspire 生成時の override_target 選択 UI（5 択）。
 *
 * - keep_all (null): テンプレのアングル/ポーズ/衣装/背景を維持してキャラだけ差し替え
 * - angle / pose / outfit / background: その 1 要素だけを再生成、他は維持
 *
 * MVP で先送りされていた個別オーバーライド機能。バックエンド（DB / RPC / worker /
 * prompt-core / API handler）は既に対応済みで、本 UI を有効化することで利用可能になる。
 *
 * 関連: 計画書 ADR-013 / Phase 6 / REQ-G-05 / REQ-G-06
 */

export type InspireOverrideValue = InspireOverrideTarget | "keep_all";

interface InspireOverrideRadioCopy {
  label: string;
  hint: string;
  keepAll: string;
  angle: string;
  pose: string;
  outfit: string;
  background: string;
}

interface InspireOverrideRadioProps {
  value: InspireOverrideValue;
  onChange: (value: InspireOverrideValue) => void;
  disabled?: boolean;
  copy: InspireOverrideRadioCopy;
}

const OPTIONS: ReadonlyArray<{
  value: InspireOverrideValue;
  copyKey: keyof Omit<InspireOverrideRadioCopy, "label" | "hint">;
}> = [
  { value: "keep_all", copyKey: "keepAll" },
  { value: "angle", copyKey: "angle" },
  { value: "pose", copyKey: "pose" },
  { value: "outfit", copyKey: "outfit" },
  { value: "background", copyKey: "background" },
];

export function InspireOverrideRadio({
  value,
  onChange,
  disabled,
  copy,
}: InspireOverrideRadioProps) {
  return (
    <div className="space-y-2">
      <Label className="text-base font-medium block">{copy.label}</Label>
      <RadioGroup
        value={value}
        onValueChange={(next) => onChange(next as InspireOverrideValue)}
        disabled={disabled}
        className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
      >
        {OPTIONS.map((option) => {
          const id = `inspire-override-${option.value}`;
          const isSelected = value === option.value;
          return (
            <label
              key={option.value}
              htmlFor={id}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition cursor-pointer ${
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-input bg-background hover:bg-accent"
              } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <RadioGroupItem id={id} value={option.value} />
              <span>{copy[option.copyKey]}</span>
            </label>
          );
        })}
      </RadioGroup>
      <p className="text-xs leading-5 text-slate-500">{copy.hint}</p>
    </div>
  );
}

/**
 * radio の string 値 (keep_all / angle / pose / outfit / background) を、
 * API へ送る overrideTarget 値（null か特定 target）に変換するヘルパ。
 */
export function toApiOverrideTarget(
  value: InspireOverrideValue
): InspireOverrideTarget | null {
  return value === "keep_all" ? null : value;
}
