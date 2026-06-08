"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface CollectionCelebration {
  categoryKey: string;
  displayName: string;
  /** アニメーション開始値(前回ackの種類数) */
  fromCount: number;
  /** アニメーション到達値(現在の種類数) */
  toCount: number;
  threshold: number;
  isCompleted: boolean;
  mountImageUrl: string | null;
  sharePath: string | null;
  /** 公開ページ token(= collection_completions.id)。シェアに使う */
  completionId: string | null;
}

interface Props {
  open: boolean;
  celebration: CollectionCelebration | null;
  onClose: () => void;
  /** シェアボタン押下(公開ページURLのシェア)。 */
  onShare?: (celebration: CollectionCelebration) => void;
}

// 円形プログレスリングの寸法(style カード程度の大きさ)
const RING_SIZE = 200;
const RING_STROKE = 16;
const RING_R = (RING_SIZE - RING_STROKE) / 2;
const RING_C = 2 * Math.PI * RING_R;

export function CollectionProgressModal({
  open,
  celebration,
  onClose,
  onShare,
}: Props) {
  // リングは fromCount から toCount へアニメーションさせる。
  // 親が celebration ごとに key を変えて再マウントするため、初期値=fromCount で開始し、
  // effect 内では timeout(非同期)でのみ toCount へ更新する(同期 setState を避ける)。
  const [animatedCount, setAnimatedCount] = useState(
    celebration?.fromCount ?? 0,
  );

  useEffect(() => {
    if (!open || !celebration) return;
    const id = window.setTimeout(() => {
      setAnimatedCount(celebration.toCount);
    }, 80);
    return () => window.clearTimeout(id);
  }, [open, celebration]);

  if (!celebration) return null;

  const { displayName, toCount, threshold, isCompleted, mountImageUrl } =
    celebration;
  const ratio = threshold > 0 ? Math.min(1, animatedCount / threshold) : 0;
  // 時計回りに埋まる: 上(12時)起点で arc を伸ばす(dashoffset を減らす)
  const dashoffset = RING_C * (1 - ratio);
  const reachedComplete = toCount >= threshold;

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="w-[min(92vw,420px)]">
        <DialogHeader>
          <DialogTitle className="text-center">
            {isCompleted ? "コンプリート！" : displayName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!isCompleted ? (
            <p className="text-center text-sm text-gray-600">{displayName}</p>
          ) : null}

          {/* 円形プログレスリング(時計回りに埋まる) */}
          <div className="flex justify-center py-2">
            <div className="relative aspect-square w-[min(200px,70vw)]">
              <svg
                viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
                className={`h-full w-full -rotate-90 ${
                  reachedComplete
                    ? "drop-shadow-[0_0_12px_rgba(245,158,11,0.65)]"
                    : ""
                }`}
              >
                <defs>
                  <linearGradient id="collRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FBBF24" />
                    <stop offset="100%" stopColor="#F59E0B" />
                  </linearGradient>
                </defs>
                <circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={RING_R}
                  fill="none"
                  stroke="#F1ECE4"
                  strokeWidth={RING_STROKE}
                />
                <circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={RING_R}
                  fill="none"
                  stroke="url(#collRingGrad)"
                  strokeWidth={RING_STROKE}
                  strokeLinecap="round"
                  strokeDasharray={RING_C}
                  strokeDashoffset={dashoffset}
                  className="transition-[stroke-dashoffset] duration-1000 ease-out"
                />
              </svg>
              {/* 中央ラベル(svg は回転しているので別レイヤで水平表示) */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {reachedComplete ? (
                  <span className="text-2xl font-bold text-amber-500">完成</span>
                ) : (
                  <>
                    <span className="text-4xl font-bold tabular-nums text-gray-900">
                      {toCount}
                    </span>
                    <span className="text-sm text-gray-500">/ {threshold} 種</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {isCompleted && mountImageUrl ? (
            <div className="space-y-3">
              <div className="relative mx-auto aspect-[3/4] w-48 overflow-hidden rounded-lg border border-gray-200">
                <Image
                  src={mountImageUrl}
                  alt={`${displayName} コンプリート台紙`}
                  fill
                  sizes="192px"
                  className="object-cover"
                />
              </div>
              {onShare ? (
                <button
                  type="button"
                  onClick={() => onShare(celebration)}
                  className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  台紙をシェアする
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
