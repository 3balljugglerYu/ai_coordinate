"use client";

import { Gift, Sparkles, Star, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

export type RewardTier = "normal" | "bonus" | "goal";

interface RewardBurstProps {
  show: boolean;
  label: string;
  tier: RewardTier;
}

type ParticleKind = "dot" | "star" | "sparkle";

interface ParticleSpec {
  kind: ParticleKind;
  /** 上方向中心（90°）の極角度（degree, 0°=右, 90°=上, 180°=左） */
  angle: number;
  /** ボタン中心からの終端距離（px） */
  radius: number;
  rotate: number;
  color: string;
  size: number;
  delay: number;
}

const PASTEL = {
  pink: "rgb(249 168 212)",
  lavender: "rgb(196 181 253)",
  purple: "rgb(167 139 250)",
  mint: "rgb(110 231 183)",
  sky: "rgb(125 211 252)",
  yellow: "rgb(253 224 71)",
  gold: "rgb(250 204 21)",
} as const;

/**
 * Hydration の安定性を保つため Math.random は使わず、
 * 上方向中心の扇形に散らす deterministic なパーティクル定義。
 * tier ごとに先頭 N 個をスライスして使う（normal=8 / bonus=11 / goal=14）。
 */
const PARTICLES: ParticleSpec[] = [
  { kind: "dot", angle: 90, radius: 58, rotate: 0, color: PASTEL.pink, size: 9, delay: 0 },
  { kind: "star", angle: 70, radius: 64, rotate: 18, color: PASTEL.purple, size: 12, delay: 40 },
  { kind: "dot", angle: 110, radius: 60, rotate: 0, color: PASTEL.sky, size: 8, delay: 70 },
  { kind: "sparkle", angle: 60, radius: 70, rotate: -12, color: PASTEL.yellow, size: 13, delay: 90 },
  { kind: "dot", angle: 120, radius: 66, rotate: 0, color: PASTEL.mint, size: 8, delay: 110 },
  { kind: "star", angle: 100, radius: 56, rotate: 24, color: PASTEL.lavender, size: 11, delay: 50 },
  { kind: "dot", angle: 50, radius: 72, rotate: 0, color: PASTEL.purple, size: 7, delay: 130 },
  { kind: "sparkle", angle: 130, radius: 62, rotate: 30, color: PASTEL.pink, size: 12, delay: 80 },
  // bonus 追加分
  { kind: "dot", angle: 80, radius: 78, rotate: 0, color: PASTEL.gold, size: 10, delay: 30 },
  { kind: "star", angle: 40, radius: 58, rotate: -20, color: PASTEL.sky, size: 12, delay: 150 },
  { kind: "sparkle", angle: 140, radius: 70, rotate: 15, color: PASTEL.gold, size: 14, delay: 60 },
  // goal 追加分
  { kind: "dot", angle: 95, radius: 84, rotate: 0, color: PASTEL.gold, size: 11, delay: 100 },
  { kind: "star", angle: 75, radius: 80, rotate: 35, color: PASTEL.gold, size: 13, delay: 170 },
  { kind: "sparkle", angle: 105, radius: 76, rotate: -8, color: PASTEL.gold, size: 14, delay: 20 },
];

function tierParticleCount(tier: RewardTier): number {
  if (tier === "goal") return 14;
  if (tier === "bonus") return 11;
  return 8;
}

function polarToCartesian(angleDeg: number, radius: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: Math.cos(rad) * radius,
    // CSS 座標系の y は下方向が正なので、上方向に飛ばす分は負にする
    y: -Math.sin(rad) * radius,
  };
}

export function RewardBurst({ show, label, tier }: RewardBurstProps) {
  if (!show) return null;

  const count = tierParticleCount(tier);
  const particles = PARTICLES.slice(0, count);
  const labelColorClass =
    tier === "goal"
      ? "text-yellow-500 drop-shadow-[0_2px_8px_rgba(250,204,21,0.55)]"
      : tier === "bonus"
        ? "text-pink-500 drop-shadow-[0_2px_8px_rgba(244,114,182,0.45)]"
        : "text-purple-600 drop-shadow-[0_2px_8px_rgba(167,139,250,0.4)]";

  return (
    <span
      className="pointer-events-none absolute inset-0 z-20 motion-reduce:hidden"
      aria-hidden="true"
    >
      {particles.map((p, index) => {
        const { x, y } = polarToCartesian(p.angle, p.radius);
        const style = {
          "--check-in-particle-x": `${x.toFixed(1)}px`,
          "--check-in-particle-y": `${y.toFixed(1)}px`,
          "--check-in-particle-rotate": `${p.rotate}deg`,
          "--check-in-particle-color": p.color,
          "--check-in-particle-size": `${p.size}px`,
          "--check-in-particle-delay": `${p.delay}ms`,
        } as React.CSSProperties;

        if (p.kind === "dot") {
          return (
            <span
              key={`p-${index}`}
              className="check-in-fx-particle"
              style={style}
            />
          );
        }

        const Icon = p.kind === "star" ? Star : Sparkles;
        return (
          <span
            key={`p-${index}`}
            className="check-in-fx-particle is-icon"
            style={style}
          >
            <Icon
              className="h-full w-full"
              style={{ color: p.color }}
              fill={p.kind === "star" ? p.color : "none"}
              strokeWidth={p.kind === "star" ? 1.5 : 2}
            />
          </span>
        );
      })}

      <span
        className={cn(
          "check-in-fx-reward-float flex items-center gap-1.5 text-sm font-bold sm:text-base",
          labelColorClass
        )}
        style={
          {
            "--check-in-reward-x": "0px",
            "--check-in-reward-rise": tier === "goal" ? "-52px" : "-40px",
          } as React.CSSProperties
        }
      >
        {tier === "goal" ? (
          <Trophy className="h-5 w-5" strokeWidth={2.4} />
        ) : tier === "bonus" ? (
          <Gift className="h-4 w-4" strokeWidth={2.4} />
        ) : null}
        <span>{label}</span>
      </span>
    </span>
  );
}
