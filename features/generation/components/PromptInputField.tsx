"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface PromptInputFieldProps {
  /** 入力値 (制御コンポーネント) */
  value: string;
  /** 値変更時のコールバック */
  onChange: (next: string) => void;
  /** 入力欄の label 文字列 (i18n は呼び出し側で解決) */
  label: string;
  /** placeholder (i18n 解決済み) */
  placeholder?: string;
  /** label 下のヒントテキスト (= 入力ルールの説明) */
  hint?: string;
  /** クリアボタンのテキスト (省略時はクリアボタン非表示) */
  clearLabel?: string;
  /**
   * 文字数表示テキスト (= `{current}` `{max}` を解決済みの完成文字列を渡す)。
   * 省略時は文字数バッジ非表示。
   */
  characterCount?: string;
  /** maxLength。defaults to 1500 (coordinate と揃える) */
  maxLength?: number;
  /** disabled 状態 */
  disabled?: boolean;
  /** textarea id (label の htmlFor に対応) */
  id?: string;
  /** ラッパー div に追加属性を渡したい場合 (data-tour 等の任意 data attribute も可) */
  containerProps?: React.HTMLAttributes<HTMLDivElement> & {
    [key: `data-${string}`]: string | undefined;
  };
  /** aria-invalid フラグ (= 上限超過時の見た目を呼び出し側で制御) */
  invalid?: boolean;
}

/**
 * 生成系画面で共通利用する prompt 入力 textarea。
 *
 * 既存 `features/generation/components/GenerationForm.tsx` の prompt 部分を
 * 抽出して `/style` (One-Tap Style) との共通化を行うため新設。
 * i18n は呼び出し側で解決し、props 経由で渡す責務分離にしている。
 */
export function PromptInputField({
  value,
  onChange,
  label,
  placeholder,
  hint,
  clearLabel,
  characterCount,
  maxLength = 1500,
  disabled = false,
  id = "prompt",
  containerProps,
  invalid,
}: PromptInputFieldProps) {
  const showClearButton = clearLabel !== undefined;
  const showCharacterCount = characterCount !== undefined;
  const isAtLimit = maxLength > 0 && value.length >= maxLength;
  const ariaInvalid = invalid ?? value.length > maxLength;

  return (
    <div {...containerProps}>
      {/*
        ラベルが長い場合 (例: /style のカテゴリ別ガイド文) でも、スマホで
        「クリア」ボタンが折り返しテキストの脇に窮屈に挟まらないよう、
        モバイルはラベルの下にボタンを配置し、sm 以上で従来の横並びに戻す。
      */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        {/* 管理画面で改行を入れたラベルをそのまま反映する (whitespace-pre-line)。
            複数行でも詰まりすぎないよう leading-none を leading-snug で上書き。 */}
        <Label
          htmlFor={id}
          className="whitespace-pre-line text-base font-medium leading-snug"
        >
          {label}
        </Label>
        {showClearButton && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 self-end px-2 text-xs text-gray-600 hover:text-gray-900 sm:self-auto"
            onClick={() => onChange("")}
            disabled={value.length === 0 || disabled}
            aria-label={clearLabel}
          >
            {clearLabel}
          </Button>
        )}
      </div>
      <Textarea
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 min-h-[100px]"
        maxLength={maxLength}
        aria-invalid={ariaInvalid || undefined}
        disabled={disabled}
      />
      {(hint || showCharacterCount) && (
        <p className="mt-1 flex items-center justify-between gap-3 text-xs text-gray-500">
          {hint ? <span>{hint}</span> : <span />}
          {showCharacterCount && (
            <span
              className={
                isAtLimit
                  ? "font-medium tabular-nums text-amber-600"
                  : "tabular-nums"
              }
            >
              {characterCount}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
