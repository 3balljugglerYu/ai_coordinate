"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 0 から value まで easeOut でカウントアップする数値表示。
 * 完走報酬パネル用(rAF 実装・ライブラリなし)。
 * - easeOutCubic: 最初速く最後ゆっくり刻み、着地感を出す
 * - prefers-reduced-motion では即座に最終値を表示する
 */
export function CountUpNumber({
  value,
  durationMs = 1200,
  onDone,
  className,
}: {
  value: number;
  durationMs?: number;
  /** 最終値に到達した瞬間に1回だけ呼ばれる(着地演出のトリガ) */
  onDone?: () => void;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    doneRef.current = false;
    if (value <= 0) {
      setDisplay(0);
      return;
    }
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setDisplay(value);
      doneRef.current = true;
      onDone?.();
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(eased * value));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else if (!doneRef.current) {
        doneRef.current = true;
        onDone?.();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // onDone は再スタートのトリガにしない(親のインライン関数で無限再実行しないように)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs]);

  return <span className={className}>{display.toLocaleString("en-US")}</span>;
}
