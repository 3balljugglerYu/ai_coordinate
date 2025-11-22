"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";

interface CollapsibleTextProps {
  text: string;
  maxLines: number;
  className?: string;
}

/**
 * 折りたたみ可能なテキストコンポーネント
 * 指定された行数を超える場合、「もっと見る」ボタンで展開可能
 */
export function CollapsibleText({
  text,
  maxLines,
  className = "",
}: CollapsibleTextProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [shouldShowButton, setShouldShowButton] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

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
        className="text-sm text-gray-700 whitespace-pre-wrap"
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
        {text}
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
              折りたたむ
              <ChevronDown className="ml-1 h-3 w-3 rotate-180" />
            </>
          ) : (
            <>
              もっと見る
              <ChevronDown className="ml-1 h-3 w-3" />
            </>
          )}
        </Button>
      )}
    </div>
  );
}

