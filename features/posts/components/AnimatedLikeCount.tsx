"use client";

import { useState } from "react";
import { formatCountEnUS } from "@/lib/utils";

interface AnimatedLikeCountProps {
  value: number;
  className?: string;
}

/**
 * いいね数を上下方向のスライドフェードでアニメーションさせる小コンポーネント。
 * 値が変化したタイミングだけ keyframes を発火させ、初回マウント時には発火しない。
 *
 * 値変化の検知は React 公式の「previous prop を state に保持」パターンで実装し、
 * useEffect 内での setState を避ける。
 * 参考: https://react.dev/reference/react/useState#storing-information-from-previous-renders
 */
export function AnimatedLikeCount({
  value,
  className,
}: AnimatedLikeCountProps) {
  const [previousValue, setPreviousValue] = useState(value);
  const [direction, setDirection] = useState<"up" | "down" | null>(null);
  const [renderKey, setRenderKey] = useState(0);

  if (previousValue !== value) {
    setPreviousValue(value);
    setDirection(value > previousValue ? "up" : "down");
    setRenderKey((k) => k + 1);
  }

  const animationClass =
    direction === "up"
      ? "like-fx-count-up"
      : direction === "down"
        ? "like-fx-count-down"
        : "";

  return (
    <span
      className={`relative inline-block overflow-hidden tabular-nums ${
        className ?? ""
      }`}
    >
      <span
        key={renderKey}
        className={animationClass}
        onAnimationEnd={() => setDirection(null)}
      >
        {formatCountEnUS(value)}
      </span>
    </span>
  );
}
