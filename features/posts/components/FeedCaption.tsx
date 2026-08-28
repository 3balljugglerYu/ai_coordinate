"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { linkify as linkifyText } from "@/lib/linkify";
import { buildHashtagSearchHref } from "@/lib/hashtag";
import { useSearchAvailable } from "./SearchAvailabilityProvider";
import { FEED_CAPTION_MAX_LINES, normalizeFeedCaption } from "../lib/feed-caption";

interface FeedCaptionProps {
  caption: string | null | undefined;
  /** 展開済みの本文をタップしたときに呼ぶ(投稿詳細へ遷移する) */
  onOpenDetail: () => void;
  /** 折りたたみ中に出す「もっと見る」の文言 */
  expandLabel: string;
}

/**
 * フィードのキャプション表示(X 準拠)。
 *
 * 利用者に X ユーザーが多く、慣れた操作感の方が学習コストが低いため、
 * 挙動を X に合わせる。
 *
 * - 連続改行を詰める(装飾目的の空行で画面が埋まるのを防ぐ)
 * - 5行を超えたら省略し、タップで全文展開する
 * - 展開済みの本文をタップすると投稿詳細へ移動する
 *
 * 本文中のリンクは、展開・遷移のどちらも起こさずリンク先を開く。
 * リンクを踏んだつもりで詳細へ飛ばされると、押した意図と結果がずれるため。
 */
export function FeedCaption({ caption, onOpenDetail, expandLabel }: FeedCaptionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  const text = useMemo(() => normalizeFeedCaption(caption), [caption]);
  // 検索が開いていないあいだはタグをリンクにしない。
  // リンクだけ出て遷移先が閉じている状態が、一番悪い体験になる。
  const searchAvailable = useSearchAvailable();

  const content = useMemo(
    () =>
      linkifyText(text, { hashtags: searchAvailable }).map((token, index) => {
        if (token.type === "link") {
          return (
            <a
              key={index}
              href={token.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              title={token.rawValue}
              className="break-all text-blue-600 hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {token.displayValue}
            </a>
          );
        }

        if (token.type === "hashtag") {
          return (
            <Link
              key={index}
              href={buildHashtagSearchHref(token.name)}
              className="break-all text-blue-600 hover:underline"
              // カードの詳細遷移と競合させない（URL リンクと同じ作法）
              onClick={(event) => event.stopPropagation()}
            >
              {token.rawValue}
            </Link>
          );
        }

        return <span key={index}>{token.value}</span>;
      }),
    [text, searchAvailable]
  );

  // 5行に収まっているかを実測する。収まっていれば「もっと見る」を出さない
  // (出したまま押しても何も変わらないと、押し損に感じさせてしまう)。
  useEffect(() => {
    const element = textRef.current;
    if (!element || isExpanded) {
      return;
    }
    setIsClamped(element.scrollHeight > element.clientHeight + 1);
  }, [text, isExpanded]);

  if (!text) {
    return null;
  }

  const handleClick = (event: React.SyntheticEvent) => {
    // 展開のつもりのタップで親カードの詳細遷移が起きないようにする
    event.stopPropagation();
    // 5行に収まっている本文は展開する意味が無いので、1回で詳細へ移動する。
    // ここを「常に1回目は展開」にすると、短い本文でも見た目が何も変わらないまま
    // 1タップを消費してしまい、詳細へ行くのに毎回2回押すことになる。
    if (isExpanded || !isClamped) {
      onOpenDetail();
      return;
    }
    setIsExpanded(true);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleClick(event);
        }
      }}
      className="cursor-pointer text-left"
      data-testid="feed-caption"
      data-expanded={String(isExpanded)}
    >
      <p
        ref={textRef}
        className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800"
        style={
          isExpanded
            ? undefined
            : {
                display: "-webkit-box",
                WebkitLineClamp: FEED_CAPTION_MAX_LINES,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }
        }
      >
        {content}
      </p>
      {!isExpanded && isClamped ? (
        <span className="text-sm font-medium text-muted-foreground">{expandLabel}</span>
      ) : null}
    </div>
  );
}
