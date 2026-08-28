"use client";

import { useRef, useState } from "react";
import { RichTextarea } from "rich-textarea";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { tokenizeWithHashtags } from "@/lib/hashtag";
import { useSearchAvailable } from "./SearchAvailabilityProvider";
import { HashtagTypeahead } from "./HashtagTypeahead";

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
  // 入力中のタグ候補を出すために、カーソル位置と変換状態を見る。
  // 変換中に候補を出すと変換候補と二重になるので、composing で止める。
  const [caret, setCaret] = useState<number | null>(null);
  const [composing, setComposing] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const trackCaret = (
    event: React.SyntheticEvent<HTMLTextAreaElement>
  ): void => {
    setCaret(event.currentTarget.selectionStart ?? null);
  };

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
    // 候補リストを直下に重ねるための基準
    <div className="relative" ref={wrapperRef}>
    <RichTextarea
      id={id}
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
        trackCaret(event);
      }}
      onSelect={trackCaret}
      onKeyUp={trackCaret}
      onClick={trackCaret}
      onBlur={(event) => {
        /*
          候補を押したときに blur が先に走ると、カーソル位置が消えて候補ごと
          消える（= タップしても何も入らない）。候補ボタンは mousedown を
          止めてフォーカスを奪わないが、端末によっては先に移ることがあるため、
          移った先が自分の中なら閉じない。
        */
        const next = event.relatedTarget as Node | null;
        if (next && wrapperRef.current?.contains(next)) return;
        setCaret(null);
      }}
      onCompositionStart={() => setComposing(true)}
      onCompositionEnd={(event) => {
        setComposing(false);
        trackCaret(event);
      }}
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
      <HashtagTypeahead
        value={value}
        caret={caret}
        composing={composing}
        onSelect={onChange}
        disabled={disabled}
      />
    </div>
  );
}
