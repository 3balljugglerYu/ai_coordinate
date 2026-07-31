"use client";

import { useEffect, useState } from "react";

/** Tailwind の `md` と揃える。ここより広ければデスクトップ扱い。 */
const DESKTOP_QUERY = "(min-width: 768px)";

/**
 * デスクトップ幅かどうか。
 *
 * 初期値は false（モバイル）にしてある。SSR では画面幅が分からないため、
 * どちらかに決め打つほかない。モバイルを既定にすると、狭い画面でだけ
 * 一瞬デスクトップ用のレイアウトが出るという事故が起きない。
 *
 * `matchMedia` が無い環境（古いブラウザ・テスト）でも false のままで動く。
 */
export function useIsDesktopViewport(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }

    const query = window.matchMedia(DESKTOP_QUERY);
    const update = () => setIsDesktop(query.matches);

    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return isDesktop;
}
