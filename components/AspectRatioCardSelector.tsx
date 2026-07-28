"use client";

import { useEffect, useId, useRef } from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Check, Image as ImageIcon, Sparkles, UserCog } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 表示文言。i18n の解決は呼び出し側の責務にして、この部品は表示に専念する
 * (Free は next-intl、admin は日本語直書きと解決方法が異なるため)。
 */
export interface AspectRatioCardSelectorLabels {
  /** セクション見出し。 */
  sectionTitle: string;
  /** "source"(自動) カードのキャプション。 */
  auto: string;
  /** "source" の補足説明(スクリーンリーダー向け)。 */
  autoDescription: string;
  /** "preset_image" カードのキャプション。modes に含める場合は必須。 */
  presetImage?: string;
  /** "preset_image" の補足説明(スクリーンリーダー向け)。 */
  presetImageDescription?: string;
  /** "user_select"(ユーザーが決める) カードのキャプション。modes に含める場合は必須。 */
  userSelect?: string;
  /** "user_select" の補足説明(スクリーンリーダー向け)。 */
  userSelectDescription?: string;
  /** 1:1 のキャプション/向き。 */
  square: string;
  /** 縦長比率の向き(aria 用)。 */
  portrait: string;
  /** 横長比率の向き(aria 用)。 */
  landscape: string;
}

interface AspectRatioCardSelectorProps {
  /** 選択肢。"source" / "preset_image" / "16:9" などの比率ラベル。 */
  modes: readonly string[];
  value: string;
  onChange: (value: string) => void;
  labels: AspectRatioCardSelectorLabels;
  disabled?: boolean;
}

/** 比率以外の「動的に決まる」モード(固定枠を持たないカード)。 */
const DYNAMIC_MODES = new Set(["source", "preset_image", "user_select"]);

/**
 * 出力アスペクト比を選ぶ横スクロールのカードセレクタ(表示専用)。
 *
 * - Radix RadioGroup により radiogroup/radio セマンティクス・キーボード操作
 *   (矢印キー移動)・RTL を担保する。選択は aria-checked と ✓ アイコンで示し、
 *   色だけに依存しない。
 * - 各カードは実際の比率の形。"source"/"preset_image" は固定枠を持たないため
 *   破線枠 + アイコンで「自動で決まる」ことを表す。
 * - 選択中カードが表示範囲外なら、コンテナの scrollLeft だけを調整して見える位置に
 *   寄せる(ページの縦スクロールには干渉しない)。
 *
 * じゆうモード(features/generation/components/AspectRatioSelector)と
 * admin のカテゴリ編集の双方から利用する。
 */
export function AspectRatioCardSelector({
  modes,
  value,
  onChange,
  labels,
  disabled,
}: AspectRatioCardSelectorProps) {
  const labelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // 選択中カードが横スクロール領域外にあるとき、見える位置まで寄せる。
  // 前回選択(右側の比率など)を復元した際に「選択が画面外で見えない」問題を解消する。
  // container.scrollLeft のみ操作し、ページの縦スクロールには影響させない。
  // 既に見えているカード(ユーザーが直接クリックした場合など)は動かさない。
  useEffect(() => {
    const container = containerRef.current;
    const selected = selectedRef.current;
    if (!container || !selected) return;
    const cRect = container.getBoundingClientRect();
    const sRect = selected.getBoundingClientRect();
    const PADDING = 12;
    if (sRect.left < cRect.left) {
      container.scrollLeft -= cRect.left - sRect.left + PADDING;
    } else if (sRect.right > cRect.right) {
      container.scrollLeft += sRect.right - cRect.right + PADDING;
    }
  }, [value]);

  return (
    <div>
      <span id={labelId} className="mb-2 block text-base font-medium">
        {labels.sectionTitle}
      </span>
      <RadioGroupPrimitive.Root
        ref={containerRef}
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        orientation="horizontal"
        aria-labelledby={labelId}
        // フォーカスリングが切れないよう左右に余白を確保しつつ横スクロール。
        className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 pt-1"
      >
        {modes.map((mode) => {
          const isDynamic = DYNAMIC_MODES.has(mode);
          const isPresetImage = mode === "preset_image";
          const isUserSelect = mode === "user_select";
          const [w, h] = isDynamic ? [1, 1] : mode.split(":").map(Number);
          const orientation =
            w === h ? labels.square : w > h ? labels.landscape : labels.portrait;
          // カード下のキャプション: 動的モードは専用文言 / 1:1=正方形 / それ以外は比率そのもの。
          const caption = isUserSelect
            ? (labels.userSelect ?? mode)
            : isPresetImage
              ? (labels.presetImage ?? mode)
              : mode === "source"
              ? labels.auto
              : w === h
                ? labels.square
                : mode;
          // スクリーンリーダー向けには比率と向き(または補足説明)を明示する。
          const ariaLabel = isUserSelect
            ? `${labels.userSelect ?? mode}（${labels.userSelectDescription ?? ""}）`
            : isPresetImage
              ? `${labels.presetImage ?? mode}（${labels.presetImageDescription ?? ""}）`
              : mode === "source"
              ? `${labels.auto}（${labels.autoDescription}）`
              : `${mode} ${orientation}`;

          return (
            <RadioGroupPrimitive.Item
              key={mode}
              ref={mode === value ? selectedRef : undefined}
              value={mode}
              aria-label={ariaLabel}
              className={cn(
                "group flex shrink-0 flex-col items-center gap-1.5 rounded-lg outline-none",
                "focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              {/* プレビュー枠(比率の形)。選択時はグラデ背景 + 枠色で強調。 */}
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-20 items-center justify-center rounded-lg text-xs font-semibold transition-colors",
                  isDynamic
                    ? "border-2 border-dashed border-gray-300 bg-gray-50 text-gray-400"
                    : "border-2 border-gray-200 bg-gray-100 text-gray-500",
                  "group-data-[state=checked]:border-transparent group-data-[state=checked]:bg-gradient-to-br group-data-[state=checked]:from-pink-500 group-data-[state=checked]:to-orange-400 group-data-[state=checked]:text-white",
                )}
                style={isDynamic ? { width: "5rem" } : { aspectRatio: `${w} / ${h}` }}
              >
                {isUserSelect ? (
                  <UserCog className="size-5" />
                ) : isPresetImage ? (
                  <ImageIcon className="size-5" />
                ) : mode === "source" ? (
                  <Sparkles className="size-5" />
                ) : (
                  mode
                )}
              </span>
              {/* キャプション + 選択チェック(色以外でも選択が分かる非色依存の表現)。 */}
              <span
                className={cn(
                  "flex items-center gap-0.5 whitespace-nowrap text-xs text-gray-600",
                  "group-data-[state=checked]:font-semibold group-data-[state=checked]:text-gray-900",
                )}
              >
                <Check
                  aria-hidden="true"
                  className="hidden size-3 shrink-0 group-data-[state=checked]:inline"
                />
                {caption}
              </span>
            </RadioGroupPrimitive.Item>
          );
        })}
      </RadioGroupPrimitive.Root>
    </div>
  );
}
