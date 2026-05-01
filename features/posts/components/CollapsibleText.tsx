"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { linkify as linkifyText } from "@/lib/linkify";

interface CollapsibleTextProps {
  text: string;
  maxLines: number;
  className?: string;
  textClassName?: string;
  linkify?: boolean;
  inlineToggle?: boolean;
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
  inlineToggle = false,
}: CollapsibleTextProps) {
  const postsT = useTranslations("posts");
  const [isExpanded, setIsExpanded] = useState(false);
  const [shouldShowButton, setShouldShowButton] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  const renderedContent = useMemo(() => {
    if (!linkify) return text;
    return linkifyText(text).map((token, index) =>
      token.type === "link" ? (
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
      ) : (
        <span key={index}>{token.value}</span>
      )
    );
  }, [text, linkify]);

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

  const showInlineButton = inlineToggle && shouldShowButton && !isExpanded;
  const showStandardButton = shouldShowButton && (isExpanded || !inlineToggle);

  return (
    <div className={className}>
      <div className={showInlineButton ? "relative" : undefined}>
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
        {showInlineButton && (
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="absolute bottom-0 right-0 bg-gradient-to-l from-white from-30% to-white/0 pl-8 text-xs text-gray-500 hover:text-gray-700"
          >
            ...{postsT("readMore")}
          </button>
        )}
      </div>
      {showStandardButton && (
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
