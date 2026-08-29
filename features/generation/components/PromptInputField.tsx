"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  /**
   * ラベルと「クリア」ボタンを常に 1 行(横並び)で表示するか。
   * 既定(false)はスマホで縦積み(/style の長いカテゴリ別ガイド文対策)。
   * ラベルが短い画面(例: じゆうモードの「生成したい内容」)では true にして
   * スマホでも 1 行に収める。
   */
  labelRowSingleLine?: boolean;
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
  labelRowSingleLine = false,
}: PromptInputFieldProps) {
  const showClearButton = clearLabel !== undefined;
  const showCharacterCount = characterCount !== undefined;
  const isAtLimit = maxLength > 0 && value.length >= maxLength;
  const ariaInvalid = invalid ?? value.length > maxLength;

  /*
    上限で止まった入力欄は、iOS だとスクロール中しかバーが出ないため
    「そこで終わっている」ように見える。まだ下に続くときだけ、
    欄の下端にぼかしを重ねて続きがあることを示す。
  */
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [hasMoreBelow, setHasMoreBelow] = useState(false);
  /*
    自前のスクロール位置表示。iOS Safari は scrollbar-width などの指定を無視し、
    標準のバーもスクロール中しか出さないため、CSS では常時表示できない。
    「どのあたりを見ているか」を示すには自分で描くしかない。
  */
  const [thumb, setThumb] = useState<{ top: number; height: number } | null>(
    null
  );

  const updateScrollHint = useCallback(() => {
    const element = textareaRef.current;
    if (!element) return;

    const { scrollTop, scrollHeight, clientHeight } = element;
    const overflow = scrollHeight - clientHeight;

    setHasMoreBelow(overflow - scrollTop > 4);

    if (overflow <= 4 || clientHeight === 0) {
      setThumb(null);
      return;
    }

    // つまみは短くなりすぎると掴みどころが無くなるので下限を置く
    const height = Math.max(24, (clientHeight / scrollHeight) * clientHeight);
    const top = (scrollTop / overflow) * (clientHeight - height);
    setThumb({ top, height });
  }, []);

  useEffect(() => {
    updateScrollHint();
  }, [value, updateScrollHint]);

  useEffect(() => {
    // 画面回転や折返しの変化でも位置がずれないようにする
    window.addEventListener("resize", updateScrollHint);
    return () => window.removeEventListener("resize", updateScrollHint);
  }, [updateScrollHint]);

  return (
    <div {...containerProps}>
      {/*
        既定: ラベルが長い場合 (例: /style のカテゴリ別ガイド文) でも、スマホで
        「クリア」ボタンが折り返しテキストの脇に窮屈に挟まらないよう、
        モバイルはラベルの下にボタンを配置し、sm 以上で従来の横並びに戻す。
        labelRowSingleLine=true: ラベルが短い画面(例: じゆうモード)では
        スマホでも常に 1 行(横並び)にする。
      */}
      <div
        className={
          labelRowSingleLine
            ? "flex flex-row items-center justify-between gap-2"
            : "flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2"
        }
      >
        {/* 管理画面で改行を入れたラベルをそのまま反映する (whitespace-pre-line)。
            複数行でも詰まりすぎないよう leading-none を leading-snug で上書き。 */}
        <Label
          htmlFor={id}
          className="whitespace-pre-line text-base font-medium leading-snug"
        >{label}</Label>
        {showClearButton && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={
              labelRowSingleLine
                ? "h-7 shrink-0 self-auto px-2 text-xs text-gray-600 hover:text-gray-900"
                : "h-7 self-end px-2 text-xs text-gray-600 hover:text-gray-900 sm:self-auto"
            }
            onClick={() => onChange("")}
            disabled={value.length === 0 || disabled}
            aria-label={clearLabel}
          >
            {clearLabel}
          </Button>
        )}
      </div>
      <div className="relative">
      <Textarea
        ref={textareaRef}
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={updateScrollHint}
        /*
          高さの上限。共通 Textarea は field-sizing-content で内容に合わせて
          伸びるため、長いプロンプト(実測で最長 19,224 文字)を入れると入力欄が
          ページを埋め尽くし、文字数・クリア・生成ボタンが画面外へ出ていた。
          上限に達したら**畳まずに**欄の中でスクロールする。

          21 行ぶん(モバイルの text-base で約 520px)を上限にしつつ、画面の 55% を
          超えないようにする。小さい端末で 21 行を許すと、入力欄だけで画面が
          埋まって元の問題が戻るため。
        */
        className="mt-2 max-h-[min(32.5rem,55vh)] min-h-[100px] overflow-y-auto [scrollbar-width:thin]"
        maxLength={maxLength}
        aria-invalid={ariaInvalid || undefined}
        disabled={disabled}
      />
      {hasMoreBelow ? (
        <div
          aria-hidden="true"
          data-testid="prompt-scroll-hint"
          className="pointer-events-none absolute inset-x-px bottom-px h-7 rounded-b-md bg-gradient-to-t from-white via-white/80 to-transparent"
        />
      ) : null}
      {thumb ? (
        <div
          aria-hidden="true"
          data-testid="prompt-scroll-thumb"
          className="pointer-events-none absolute right-1.5 w-1 rounded-full bg-slate-400/60"
          style={{ top: thumb.top + 2, height: thumb.height }}
        />
      ) : null}
      </div>
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
