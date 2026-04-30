"use client";

import { useEffect } from "react";

export const COORDINATE_GENERATED_LIST_ID = "coordinate-generated-list";
export const COORDINATE_GENERATED_LIST_HASH = `#${COORDINATE_GENERATED_LIST_ID}`;

/**
 * /coordinate に hash 付きで遷移してきたとき、生成結果一覧へ
 * スムーススクロールする。Next.js App Router の soft nav では
 * hash 自動スクロールが効かない場合があるため明示的に処理する。
 */
export function CoordinateGeneratedListHashScroll() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== COORDINATE_GENERATED_LIST_HASH) return;

    const timeoutId = window.setTimeout(() => {
      const el = document.getElementById(COORDINATE_GENERATED_LIST_ID);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);

    return () => window.clearTimeout(timeoutId);
  }, []);

  return null;
}
