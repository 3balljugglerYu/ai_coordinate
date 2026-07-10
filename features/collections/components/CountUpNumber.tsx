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
  // Latest Ref Pattern: 親の再レンダーで新しい onDone が渡されても、
  // アニメーションを再トリガーせずに常に最新の関数を呼ぶ(stale closure回避)。
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    doneRef.current = false;
    // 0以下は描画0のまま(呼び出し側パネルが額<=0で非表示にする前提)。
    if (value <= 0) {
      return;
    }
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // setState は必ず rAF コールバック内で行う(effect本体での同期setState回避)。
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      if (reduceMotion) {
        setDisplay(value);
        doneRef.current = true;
        onDoneRef.current?.();
        return;
      }
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(eased * value));
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else if (!doneRef.current) {
        doneRef.current = true;
        onDoneRef.current?.();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return <span className={className}>{display.toLocaleString("en-US")}</span>;
}
