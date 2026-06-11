"use client";

import type { CSSProperties } from "react";

/**
 * 公開台紙ページ(/m)の祝福背景。2レイヤー構成:
 *  1) 画面中心から射す金色の放射光線(ゆっくり回転)
 *  2) 上から下へ舞い落ちる紙吹雪(常時ループ)
 *
 * - 画面全体に fixed inset-0 で敷き、コンテンツの背後(-z-10)に置く。
 * - 放射光線は repeating-conic-gradient + mask、紙吹雪は transform/opacity のみ。
 *   filter は使わず軽量。Math.random は使わず index 由来の deterministic 値で
 *   散らす(hydration安定)。紙吹雪は負の delay で位相をずらし、最初から降っている。
 * - prefers-reduced-motion では放射光線の回転を止め(静的な後光として残す)、
 *   紙吹雪レイヤーは非表示にする。
 */

const CONFETTI_COLORS = [
  "#FBBF24", // amber
  "#F97316", // orange
  "#F472B6", // pink
  "#A78BFA", // purple
  "#34D399", // mint
  "#60A5FA", // sky
  "#FDE68A", // pale gold
] as const;

const CONFETTI_COUNT = 44;

/** index と seed から 0..1 の決定的擬似乱数を作る(Math.random 不使用) */
function rand(i: number, seed: number): number {
  const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

interface ConfettiPiece {
  left: number;
  width: number;
  height: number;
  color: string;
  drift: number;
  rotate: number;
  duration: number;
  delay: number;
  opacity: number;
}

// モジュールロード時に1回だけ生成(毎レンダーの再計算を避ける)。
const CONFETTI: ConfettiPiece[] = Array.from(
  { length: CONFETTI_COUNT },
  (_, i) => ({
    left: rand(i, 1) * 100,
    width: 5 + rand(i, 2) * 4,
    height: 8 + rand(i, 3) * 6,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    drift: (rand(i, 4) - 0.5) * 120,
    rotate: rand(i, 5) * 720 - 360,
    duration: 6800 + rand(i, 6) * 4500,
    // 負の delay で位相をずらし、最初から画面の途中を降っている状態にする。
    // delay 範囲は duration 最大値に合わせて広げ、位相を均等に散らす。
    delay: -(rand(i, 7) * 11000),
    opacity: 0.5 + rand(i, 8) * 0.4,
  }),
);

export function MountCelebrationBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      aria-hidden
    >
      <style>{`
        @keyframes coll-rays-spin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to   { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes coll-fall-loop {
          0%   { transform: translateY(-12vh) translateX(0) rotate(0deg); opacity: 0; }
          8%   { opacity: var(--cf-op); }
          92%  { opacity: var(--cf-op); }
          100% { transform: translateY(112vh) translateX(var(--cf-drift))
                   rotate(var(--cf-rot)); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .coll-rays { animation: none !important; }
        }
      `}</style>

      {/* 1) 放射光線 */}
      <div
        className="coll-rays"
        style={
          {
            position: "absolute",
            left: "50%",
            top: "50%",
            width: "200vmax",
            height: "200vmax",
            transform: "translate(-50%, -50%)",
            background: `repeating-conic-gradient(
              rgba(253, 224, 71, 0.16) 0deg 7deg,
              transparent 7deg 22deg
            )`,
            WebkitMaskImage:
              "radial-gradient(circle, #000 0%, rgba(0,0,0,0.35) 35%, transparent 62%)",
            maskImage:
              "radial-gradient(circle, #000 0%, rgba(0,0,0,0.35) 35%, transparent 62%)",
            animation: "coll-rays-spin 40s linear infinite",
          } as CSSProperties
        }
      />

      {/* 2) 舞い落ちる紙吹雪(ループ)。reduced-motion では非表示。 */}
      <div className="motion-reduce:hidden">
        {CONFETTI.map((c, i) => (
          <span
            key={i}
            style={
              {
                position: "absolute",
                top: 0,
                left: `${c.left}%`,
                width: `${c.width}px`,
                height: `${c.height}px`,
                background: c.color,
                borderRadius: "1px",
                willChange: "transform, opacity",
                animation: `coll-fall-loop ${c.duration}ms linear ${c.delay}ms infinite`,
                "--cf-drift": `${c.drift}px`,
                "--cf-rot": `${c.rotate}deg`,
                "--cf-op": c.opacity,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}
