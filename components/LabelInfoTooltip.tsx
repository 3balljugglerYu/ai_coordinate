"use client";

import * as Popover from "@radix-ui/react-popover";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface LabelInfoTooltipProps {
  /** ポップオーバー本文。改行を入れたいときは `whitespace-pre-line` を効かせるか、ReactNode を渡す */
  content: ReactNode;
  /** トリガーの "?" ボタンに付ける aria-label。スクリーンリーダー向けの説明 */
  ariaLabel: string;
  /** Popover.Content の追加クラス。max-width などをこちらで上書きする */
  contentClassName?: string;
  /** トリガーボタンの追加クラス */
  triggerClassName?: string;
  /** Popover.Content の side / align（デフォルト top / end） */
  side?: Popover.PopoverContentProps["side"];
  align?: Popover.PopoverContentProps["align"];
}

/**
 * ラベルの横に置く「?」ボタン型の説明ポップアップ。
 *
 * もとは /i2i POC で Tooltip 実装されていたパターンを共有コンポーネント化したもの。
 * Radix Tooltip はホバー / フォーカス専用でタッチ端末では開かない仕様のため、
 * Popover ベースに切り替えてタップでもタップ外しでも閉じる挙動を確保している。
 *
 * 関連: features/i2i-poc/components/I2iPocClient.tsx（こちらは旧 Tooltip 実装のまま）
 */
export function LabelInfoTooltip({
  content,
  ariaLabel,
  contentClassName,
  triggerClassName,
  side = "top",
  align = "end",
}: LabelInfoTooltipProps) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            // タップ領域確保のためスマホは 20px、デスクトップは詰めて 14px
            "inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-[9px] font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 md:h-3.5 md:w-3.5 md:text-[9px]",
            triggerClassName
          )}
          aria-label={ariaLabel}
        >
          ?
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side={side}
          align={align}
          sideOffset={4}
          collisionPadding={8}
          className={cn(
            "z-40 max-w-[11rem] rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] leading-snug text-slate-700 shadow-md focus:outline-none",
            contentClassName
          )}
        >
          {content}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
