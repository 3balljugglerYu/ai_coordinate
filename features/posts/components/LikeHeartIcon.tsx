"use client";

import { Heart } from "lucide-react";
import type { CSSProperties, SyntheticEvent } from "react";

export type LikeHeartPhase = "idle" | "burst" | "press";

interface LikeHeartIconProps {
  liked: boolean;
  phase: LikeHeartPhase;
  size?: "sm" | "md";
  onAnimationEnd?: () => void;
}

const SIZE_MAP = {
  sm: {
    icon: "h-4 w-4",
    overlayInset: "-inset-2",
  },
  md: {
    icon: "h-5 w-5",
    overlayInset: "-inset-2.5",
  },
} as const;

const RAY_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315] as const;

// バースト直後にハート中心からふわふわ上昇する小ハート群。
// x: 開始位置の水平オフセット（px）
// rise: 上昇距離（px、負値で上へ）
// drift: 中盤の横揺れ振幅（px、正/負で揺れる方向が変わる）
// size: ハート個体のサイズ（px）
// color: 塗り色（rgb 文字列）
const FLOAT_HEARTS: ReadonlyArray<{
  x: number;
  rise: number;
  drift: number;
  size: number;
  color: string;
}> = [
  { x: -7, rise: -40, drift: 4, size: 9, color: "rgb(239 68 68)" }, // red-500
  { x: 1, rise: -75, drift: -5, size: 12, color: "rgb(251 113 133)" }, // rose-400 — 一番上まで飛ぶ
  { x: 8, rise: -34, drift: 4, size: 10, color: "rgb(244 114 182)" }, // pink-400
];

export function LikeHeartIcon({
  liked,
  phase,
  size = "sm",
  onAnimationEnd,
}: LikeHeartIconProps) {
  const cls = SIZE_MAP[size];

  const heartAnimationClass =
    phase === "burst"
      ? "like-fx-heart-pop"
      : phase === "press"
        ? "like-fx-heart-press"
        : "";

  const handleAnimationEnd = (event: SyntheticEvent<SVGSVGElement>) => {
    if (event.target !== event.currentTarget) return;
    onAnimationEnd?.();
  };

  return (
    <span
      className={`relative inline-flex items-center justify-center ${cls.icon}`}
    >
      {phase === "burst" && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute ${cls.overlayInset} motion-reduce:hidden`}
        >
          <span className="like-fx-ripple" />
          {RAY_ANGLES.map((angle) => (
            <span
              key={angle}
              className="like-fx-ray"
              style={
                { "--like-ray-angle": `${angle}deg` } as CSSProperties
              }
            />
          ))}
          {FLOAT_HEARTS.map((h, i) => (
            <span
              key={i}
              className="like-fx-floatheart"
              style={
                {
                  "--like-floatheart-x": `${h.x}px`,
                  "--like-floatheart-rise": `${h.rise}px`,
                  "--like-floatheart-drift": `${h.drift}px`,
                  "--like-floatheart-size": `${h.size}px`,
                  "--like-floatheart-color": h.color,
                } as CSSProperties
              }
            >
              <Heart
                className="h-full w-full"
                fill="currentColor"
                stroke="none"
              />
            </span>
          ))}
          <span className="like-fx-sparkle" />
        </span>
      )}

      {/*
        色補間を行うと「薄赤を経由してから赤へ」というワンテンポずれた印象になるため、
        transition-colors は付けない。fill / stroke は即座に切り替えて、
        余白の演出（リップル・放射光線・上昇ハート・スパークル）に視覚的な遷移を任せる。
      */}
      <Heart
        className={`${cls.icon} ${
          liked ? "fill-red-500 text-red-500" : "text-gray-600"
        } ${heartAnimationClass}`}
        onAnimationEnd={handleAnimationEnd}
      />
    </span>
  );
}
