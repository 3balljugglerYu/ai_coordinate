"use client";

import type { CSSProperties } from "react";

/**
 * コレクション完了台紙の「ダイヤのきらめき」演出。
 *
 * - 4芒星のスパークルがモーダル内に点在し、ランダムなタイミングで
 *   チカッと光って消える(twinkle)。完了台紙を見返す落ち着いた場面向け。
 * - モーダル枠内を彩りたいので(画面全体に飛ばす紙吹雪と違い)
 *   モーダル内に absolute inset-0 で重ねる。
 * - transform/opacity のみで軽量。filter は使わない。Math.random は使わず
 *   index 由来の deterministic 値で散らす(hydration安定)。
 * - prefers-reduced-motion では非表示。
 */

const SPARKLE_COLORS = [
  "#FFFFFF",
  "#FDE68A",
  "#FCD34D",
  "#BAE6FD",
] as const;

const SPARKLE_COUNT = 16;

/** index と seed から 0..1 の決定的擬似乱数を作る(Math.random 不使用) */
function rand(i: number, seed: number): number {
  const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

interface Sparkle {
  left: number;
  top: number;
  size: number;
  color: string;
  delay: number;
  duration: number;
}

// モジュールロード時に1回だけ生成(毎レンダーの再計算を避ける)。
const SPARKLES: Sparkle[] = Array.from({ length: SPARKLE_COUNT }, (_, i) => ({
  left: rand(i, 1) * 100,
  top: rand(i, 2) * 100,
  size: 16 + rand(i, 3) * 22,
  color: SPARKLE_COLORS[i % SPARKLE_COLORS.length],
  delay: rand(i, 4) * 2400,
  duration: 1200 + rand(i, 5) * 1400,
}));

export function CollectionSparkle({ show }: { show: boolean }) {
  if (!show) return null;

  return (
    <span
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden motion-reduce:hidden"
      aria-hidden
    >
      <style>{`
        @keyframes coll-sparkle-twinkle {
          0%, 100% { transform: scale(0) rotate(0deg); opacity: 0; }
          50%      { transform: scale(1) rotate(45deg); opacity: 1; }
        }
      `}</style>
      {SPARKLES.map((s, i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          aria-hidden
          style={
            {
              position: "absolute",
              left: `${s.left}%`,
              top: `${s.top}%`,
              width: `${s.size}px`,
              height: `${s.size}px`,
              color: s.color,
              transformOrigin: "center",
              willChange: "transform, opacity",
              animation: `coll-sparkle-twinkle ${s.duration}ms ${s.delay}ms ease-in-out infinite`,
            } as CSSProperties
          }
        >
          {/* 4芒星(中心から上下左右へ尖るダイヤ型のきらめき) */}
          <path
            d="M12 0 C13 9 15 11 24 12 C15 13 13 15 12 24 C11 15 9 13 0 12 C9 11 11 9 12 0 Z"
            fill="currentColor"
          />
        </svg>
      ))}
    </span>
  );
}
