"use client";

import { useEffect, useState } from "react";

type ScrollDirection = "up" | "down" | null;

/**
 * スクロール方向を検知するフック
 * 下にスクロールで"down"、上にスクロールで"up"を返す
 */
export function useScrollDirection(): ScrollDirection {
  const [scrollDirection, setScrollDirection] = useState<ScrollDirection>(null);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const updateScrollDirection = () => {
      const scrollY = window.scrollY;

      if (scrollY === 0) {
        setScrollDirection(null);
      } else if (scrollY > lastScrollY) {
        setScrollDirection("down");
      } else if (scrollY < lastScrollY) {
        setScrollDirection("up");
      }

      setLastScrollY(scrollY > 0 ? scrollY : 0);
    };

    // 初回レンダリング時はスクロール位置を記録
    setLastScrollY(window.scrollY);

    window.addEventListener("scroll", updateScrollDirection, { passive: true });

    return () => {
      window.removeEventListener("scroll", updateScrollDirection);
    };
  }, [lastScrollY]);

  return scrollDirection;
}

