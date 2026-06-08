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
  /** シェアボタン押下(公開ページURLのシェア)。Phase 5 で配線。 */
  onShare?: (celebration: CollectionCelebration) => void;
}

export function CollectionProgressModal({
  open,
  celebration,
  onClose,
  onShare,
}: Props) {
  // バーは fromCount から toCount へアニメーションさせる。
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
  const ratio =
    threshold > 0 ? Math.min(1, animatedCount / threshold) : 0;

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

          <div className="space-y-2">
            <div className="flex items-end justify-center gap-1">
              <span className="text-3xl font-bold text-primary tabular-nums">
                {toCount}
              </span>
              <span className="pb-1 text-sm text-gray-500">/ {threshold} 種</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                style={{ width: `${Math.round(ratio * 100)}%` }}
              />
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
