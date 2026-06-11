"use client";

import type { CSSProperties } from "react";
import { createPortal } from "react-dom";

/**
 * コレクションモーダルの「左右からクラッカーのように吹き出す」紙吹雪演出。
 *
 * - 画面の左下/右下から斜め上へ吹き出し、放物線を描いて舞い落ちる。
 * - 放物線は3層に分けて transform 競合を避けて作る:
 *     最外 = 発射口(左下/右下に固定) / 中 = 横移動(translateX) / 内 = 縦移動(translateY)+回転。
 *   横を ease-out・縦を「上昇(減速)→落下(加速)」にすると重力風の弧になる。
 * - 画面全体に飛ばしたいので createPortal で body 直下に出す
 *   (Dialog の translate が fixed の包含ブロックを奪うため)。
 * - transform/opacity のみ・一度きり再生で軽量。Math.random は使わず
 *   index 由来の deterministic 値で散らす(hydration安定)。
 * - prefers-reduced-motion では非表示。
 */

const COLORS = [
  "#FBBF24", // amber
  "#F97316", // orange
  "#F472B6", // pink
  "#A78BFA", // purple
  "#34D399", // mint
  "#60A5FA", // sky
  "#FDE68A", // pale gold
] as const;

const PIECE_COUNT = 110;
const HALF = PIECE_COUNT / 2;

/** index と seed から 0..1 の決定的擬似乱数を作る(Math.random 不使用) */
function rand(i: number, seed: number): number {
  const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

interface Piece {
  fromLeft: boolean;
  dx: number; // 横の飛距離(vw)。左発射は+・右発射は-
  peak: number; // 弧の頂点(vh, 負=上)
  fall: number; // 最終落下位置(vh, 正=下/画面外)
  rotate: number;
  duration: number;
  delay: number;
  color: string;
  width: number;
  height: number;
}

// モジュールロード時に1回だけ生成(毎レンダーの再計算を避ける)。
const PIECES: Piece[] = Array.from({ length: PIECE_COUNT }, (_, i) => {
  const fromLeft = i < HALF;
  const magnitude = 26 + rand(i, 1) * 56; // vw
  return {
    fromLeft,
    dx: (fromLeft ? 1 : -1) * magnitude,
    peak: -(28 + rand(i, 2) * 34),
    fall: 18 + rand(i, 3) * 38,
    rotate: rand(i, 4) * 1080 - 540,
    duration: 1500 + rand(i, 5) * 1100,
    delay: rand(i, 6) * 140,
    color: COLORS[i % COLORS.length],
    width: 6 + rand(i, 7) * 5,
    height: 9 + rand(i, 8) * 7,
  };
});

export function CollectionConfetti({ show }: { show: boolean }) {
  // show=true になるのはモーダルを開いた後(クライアント操作起点)のみ。
  // SSR では show=false で早期 return するため document を参照しない。
  if (!show || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0 z-[60] overflow-hidden motion-reduce:hidden"
      aria-hidden
    >
      <style>{`
        /* 横移動: 発射直後が速く、空気抵抗で減速 */
        @keyframes coll-cracker-x {
          0%   { transform: translateX(0);
                 animation-timing-function: cubic-bezier(.15,.7,.4,1); }
          100% { transform: translateX(var(--coll-dx)); }
        }
        /* 縦移動+回転: 上昇(減速して頂点)→落下(加速) の重力風アーク */
        @keyframes coll-cracker-y {
          0%   { transform: translateY(0) rotate(0deg); opacity: 1;
                 animation-timing-function: cubic-bezier(.2,.6,.5,1); }
          38%  { transform: translateY(var(--coll-peak))
                   rotate(calc(var(--coll-rot) * .4));
                 animation-timing-function: cubic-bezier(.5,0,.8,.6); }
          100% { transform: translateY(var(--coll-fall))
                   rotate(var(--coll-rot)); opacity: 0; }
        }
      `}</style>
      {PIECES.map((p, i) => (
        <span
          key={i}
          style={
            {
              position: "absolute",
              bottom: "10vh",
              [p.fromLeft ? "left" : "right"]: 0,
            } as CSSProperties
          }
        >
          {/* 中: 横移動 */}
          <span
            style={
              {
                display: "block",
                animation: `coll-cracker-x ${p.duration}ms ${p.delay}ms 1 both`,
                "--coll-dx": `${p.dx}vw`,
              } as CSSProperties
            }
          >
            {/* 内: 縦移動+回転 + 紙片本体 */}
            <span
              style={
                {
                  display: "block",
                  width: `${p.width}px`,
                  height: `${p.height}px`,
                  background: p.color,
                  borderRadius: "1px",
                  willChange: "transform, opacity",
                  animation: `coll-cracker-y ${p.duration}ms ${p.delay}ms 1 both`,
                  "--coll-peak": `${p.peak}vh`,
                  "--coll-fall": `${p.fall}vh`,
                  "--coll-rot": `${p.rotate}deg`,
                } as CSSProperties
              }
            />
          </span>
        </span>
      ))}
    </div>,
    document.body,
  );
}
