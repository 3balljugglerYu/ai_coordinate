"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CollectionProgressRing } from "./CollectionProgressRing";

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
            <CollectionProgressRing
              ratio={ratio}
              complete={reachedComplete}
              className="w-[min(200px,70vw)]"
            >
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
            </CollectionProgressRing>
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
