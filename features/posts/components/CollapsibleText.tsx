"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { linkify as linkifyText } from "@/lib/linkify";
import { buildHashtagSearchHref } from "@/lib/hashtag";
import { useSearchAvailable } from "./SearchAvailabilityProvider";

interface CollapsibleTextProps {
  text: string;
  maxLines: number;
  className?: string;
  textClassName?: string;
  linkify?: boolean;
  /**
   * `#タグ` もリンクにする。**キャプションでだけ true にすること。**
   * この部品はプロフィール文・コメント・プロンプト表示でも使われており、
   * そこのタグは保存も検索もされていない。
   */
  linkifyHashtags?: boolean;
}

/**
 * 折りたたみ可能なテキストコンポーネント
 * 指定された行数を超える場合、「もっと見る」ボタンで展開可能
 */
export function CollapsibleText({
  text,
  maxLines,
  className = "",
  textClassName = "text-gray-700",
  linkify = false,
  linkifyHashtags = false,
}: CollapsibleTextProps) {
  const postsT = useTranslations("posts");
  // 呼び出し側が許可し、かつ検索が開いているときだけタグをリンクにする
  const searchAvailable = useSearchAvailable();
  const hashtagsEnabled = linkifyHashtags && searchAvailable;
  const [isExpanded, setIsExpanded] = useState(false);
  const [shouldShowButton, setShouldShowButton] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  const renderedContent = useMemo(() => {
    if (!linkify) return text;
    return linkifyText(text, { hashtags: hashtagsEnabled }).map(
      (token, index) => {
        if (token.type === "link") {
          return (
            <a
              key={index}
              href={token.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              title={token.rawValue}
              className="text-blue-600 hover:underline break-all"
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
              className="text-blue-600 hover:underline break-all"
            >
              {token.rawValue}
            </Link>
          );
        }

        return <span key={index}>{token.value}</span>;
      }
    );
  }, [text, linkify, hashtagsEnabled]);

  useEffect(() => {
    if (textRef.current) {
      // テキストの実際の高さを測定
      const lineHeight = parseInt(
        window.getComputedStyle(textRef.current).lineHeight || "20"
      );
      const actualHeight = textRef.current.scrollHeight;
      const maxHeight = lineHeight * maxLines;

      setShouldShowButton(actualHeight > maxHeight);
    }
  }, [text, maxLines]);

  return (
    <div className={className}>
      <p
        ref={textRef}
        className={`text-sm whitespace-pre-wrap break-words ${textClassName}`}
        style={
          !isExpanded && shouldShowButton
            ? {
                display: "-webkit-box",
                WebkitLineClamp: maxLines,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }
            : {}
        }
      >
        {renderedContent}
      </p>
      {shouldShowButton && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 h-auto p-0 text-xs text-gray-500 hover:text-gray-700"
        >
          {isExpanded ? (
            <>
              {postsT("collapse")}
              <ChevronDown className="ml-1 h-3 w-3 rotate-180" />
            </>
          ) : (
            <>
              {postsT("readMore")}
              <ChevronDown className="ml-1 h-3 w-3" />
            </>
          )}
        </Button>
      )}
    </div>
  );
}
