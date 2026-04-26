"use client";

import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  isCanonicalGuestAllowedModel,
  resolveEffectiveModelForAuthState,
} from "@/features/generation/lib/model-config";
import type { GeminiModel } from "@/features/generation/types";

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
}

interface ModelOption {
  value: GeminiModel;
  labelKey:
    | "modelLight05k"
    | "modelGptImage2Low"
    | "modelStandard1k"
    | "modelPro1k"
    | "modelPro2k"
    | "modelPro4k";
}

const MODEL_OPTIONS: ReadonlyArray<ModelOption> = [
  { value: "gpt-image-2-low", labelKey: "modelGptImage2Low" },
  { value: "gemini-3.1-flash-image-preview-512", labelKey: "modelLight05k" },
  { value: "gemini-3.1-flash-image-preview-1024", labelKey: "modelStandard1k" },
  { value: "gemini-3-pro-image-1k", labelKey: "modelPro1k" },
  { value: "gemini-3-pro-image-2k", labelKey: "modelPro2k" },
  { value: "gemini-3-pro-image-4k", labelKey: "modelPro4k" },
];

/**
 * /style と /coordinate で共有するモデル選択 UI。
 *
 * - 全 6 モデルを Select で並べる（コーディネート画面と完全に同じ並び）
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

  // 表示値の clamp: ゲストのまま許可外モデルが渡されたら表示上は既定モデル扱い
  const displayValue = resolveEffectiveModelForAuthState(
    props.value,
    props.authState
  );

  const handleValueChange = (next: string) => {
    const nextModel = next as GeminiModel;
    if (isGuest && !isCanonicalGuestAllowedModel(nextModel)) {
      // ロック行クリック: 値は変えず、AuthModal を呼ぶだけ
      props.onLockedClick();
      return;
    }
    props.onChange(nextModel);
  };

  return (
    <Select
      value={displayValue}
      onValueChange={handleValueChange}
      disabled={props.disabled}
    >
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {MODEL_OPTIONS.map((option) => {
          const isLocked = isGuest && !isCanonicalGuestAllowedModel(option.value);
          if (isLocked) {
            return (
              <SelectItem
                key={option.value}
                value={option.value}
                aria-disabled
                aria-haspopup="dialog"
                data-locked
              >
                <span className="flex items-center gap-2">
                  <span>{t(option.labelKey)}</span>
                  <Lock
                    className="h-3.5 w-3.5 text-gray-500"
                    aria-hidden="true"
                  />
                </span>
              </SelectItem>
            );
          }
          // 非ロック行はシンプルにテキストだけ。SelectValue 表示時の textContent も
          // テキストノード単一になり、testing-library の getByText でも拾える。
          return (
            <SelectItem key={option.value} value={option.value}>
              {t(option.labelKey)}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
