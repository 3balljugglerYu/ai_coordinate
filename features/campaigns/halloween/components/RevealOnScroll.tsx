"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * 画面に入ったら1回だけ「ふわっと」出す(ハロウィン企画のページ)。
 * 隠すのは CSS の @media (scripting: enabled) の中だけなので、JS が動かないときは最初から見える。
 * 出したかどうかは DOM の data-revealed で持つ(描き直しを起こさない)。
 * IntersectionObserver が無い環境では、すぐに出す。
 */
export function RevealOnScroll({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const reveal = () => {
      node.dataset.revealed = "true";
    };
    if (typeof IntersectionObserver === "undefined") {
      reveal();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          reveal();
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className} data-revealed="false">
      {children}
    </div>
  );
}
