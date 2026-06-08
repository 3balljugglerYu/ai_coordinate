"use client";

import type { ReactNode } from "react";

// viewBox 固定。実寸は外側 className(幅)で制御し、SVG が拡縮する。
const VIEWBOX = 200;
const STROKE = 16;
const R = (VIEWBOX - STROKE) / 2;
const C = 2 * Math.PI * R;

/**
 * 時計回りに埋まる円形プログレスリング(オレンジ→黄)。
 * - `ratio`(0..1) の変化に CSS transition が掛かるので、親が ratio を変えると
 *   リングがアニメーションする(モーダル)。静的に渡せばその割合で止まる(マイページ)。
 * - 中央表示は children。
 * - 大きさは className(例: `w-24` / `w-[min(200px,70vw)]`)で指定する。
 */
export function CollectionProgressRing({
  ratio,
  complete = false,
  className,
  children,
}: {
  ratio: number;
  complete?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const clamped = Math.min(1, Math.max(0, ratio));
  const dashoffset = C * (1 - clamped);

  return (
    <div className={`relative aspect-square ${className ?? ""}`}>
      <svg
        viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        className={`h-full w-full -rotate-90 ${
          complete ? "drop-shadow-[0_0_12px_rgba(245,158,11,0.65)]" : ""
        }`}
      >
        <defs>
          <linearGradient id="collRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FBBF24" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>
        </defs>
        <circle
          cx={VIEWBOX / 2}
          cy={VIEWBOX / 2}
          r={R}
          fill="none"
          stroke="#F1ECE4"
          strokeWidth={STROKE}
        />
        <circle
          cx={VIEWBOX / 2}
          cy={VIEWBOX / 2}
          r={R}
          fill="none"
          stroke="url(#collRingGrad)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={dashoffset}
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
}
