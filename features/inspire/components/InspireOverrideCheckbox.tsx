"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { InspireOverrides } from "@/shared/generation/prompt-core";

/**
 * inspire 生成時の override 組み合わせ選択 UI（4 つのチェックボックス）。
 *
 * - すべてチェック: 「すべて維持」と等価で、image_1 のシーン要素（衣装 / アングル / ポーズ /
 *   背景）すべてを image_0 に適用
 * - 個別: チェックされた要素のみを image_1 から image_0 に適用
 * - すべて未チェック: 生成不可（呼び出し側で disabled にする）
 *
 * 関連: shared/generation/prompt-core.ts の InspireOverrides / buildInspirePrompt
 */

interface InspireOverrideCheckboxCopy {
  label: string;
  hint: string;
  outfit: string;
  angle: string;
  pose: string;
  background: string;
}

interface InspireOverrideCheckboxProps {
  value: InspireOverrides;
  onChange: (value: InspireOverrides) => void;
  disabled?: boolean;
  copy: InspireOverrideCheckboxCopy;
}

const ORDER: ReadonlyArray<{
  key: keyof InspireOverrides;
  copyKey: keyof Omit<InspireOverrideCheckboxCopy, "label" | "hint">;
}> = [
  { key: "outfit", copyKey: "outfit" },
  { key: "angle", copyKey: "angle" },
  { key: "pose", copyKey: "pose" },
  { key: "background", copyKey: "background" },
];

export function InspireOverrideCheckbox({
  value,
  onChange,
  disabled,
  copy,
}: InspireOverrideCheckboxProps) {
  return (
    <div className="space-y-2">
      <Label className="text-base font-medium block">{copy.label}</Label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ORDER.map(({ key, copyKey }) => {
          const id = `inspire-override-${key}`;
          const isChecked = value[key];
          return (
            <label
              key={key}
              htmlFor={id}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition cursor-pointer ${
                isChecked
                  ? "border-primary bg-primary/5"
                  : "border-input bg-background hover:bg-accent"
              } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <Checkbox
                id={id}
                checked={isChecked}
                onCheckedChange={(next) =>
                  onChange({ ...value, [key]: next === true })
                }
                disabled={disabled}
              />
              <span>{copy[copyKey]}</span>
            </label>
          );
        })}
      </div>
      <p className="text-xs leading-5 text-slate-500">{copy.hint}</p>
    </div>
  );
}
