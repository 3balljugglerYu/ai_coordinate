"use client";

import { RichTextarea } from "rich-textarea";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { tokenizeWithHashtags } from "@/lib/hashtag";
import { useSearchAvailable } from "./SearchAvailabilityProvider";

/**
 * 入力中の `#タグ` をその場で青くするキャプション入力欄（REQ-10）。
 *
 * `<textarea>` は文字単位で色を付けられないため、透明な textarea の背後に
 * 同じテキストを着色して描くオーバーレイ方式を使う（ADR-005）。実装は
 * `rich-textarea` に任せる。自作で一番難しいのは折返し・スクロール・IME 変換中の
 * 位置合わせで、そこを引き受けてくれるのがこのライブラリの本体価値。
 *
 * 着色に使う判定は表示側と**同じ** `tokenizeWithHashtags`。ここを別実装にすると
 * 「入力中は青いのに投稿すると普通の文字」というズレが生まれる（REQ-09）。
 *
 * 検索が閉じているあいだは素の `Textarea` に落とす。押せない色を見せない方針を
 * フィード表示と揃えるため。
 */

interface HashtagHighlightTextareaProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  className?: string;
  disabled?: boolean;
}

/** 素の Textarea と見た目を合わせるための共通クラス。 */
const TEXTAREA_CLASS =
  "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

export function HashtagHighlightTextarea({
  id,
  value,
  onChange,
  placeholder,
  rows = 4,
  maxLength,
  className,
  disabled,
}: HashtagHighlightTextareaProps) {
  const searchAvailable = useSearchAvailable();

  if (!searchAvailable) {
    return (
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        className={className}
        disabled={disabled}
      />
    );
  }

  return (
    <RichTextarea
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={rows}
      maxLength={maxLength}
      disabled={disabled}
      // 素の Textarea は field-sizing-content で内容に合わせて伸びる。
      // 同じ振る舞いにしないと、運営だけ入力欄が伸びない差分に見える。
      autoHeight
      className={cn(TEXTAREA_CLASS, className)}
      // 背後の描画と重ねるため、幅と高さは textarea 側に決めさせる
      style={{ width: "100%" }}
    >
      {(text) =>
        tokenizeWithHashtags(text).map((token, index) =>
          token.type === "hashtag" ? (
            <span key={index} className="text-blue-600">
              {token.rawValue}
            </span>
          ) : (
            <span key={index}>{token.value}</span>
          )
        )
      }
    </RichTextarea>
  );
}
