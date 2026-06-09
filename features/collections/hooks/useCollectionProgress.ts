"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CollectionProgress } from "@/features/collections/lib/collection-types";
import type { CollectionCelebration } from "@/features/collections/components/CollectionProgressModal";
import type { MountGeneratedResult } from "@/features/collections/components/CollectionMountComposer";

const ACK_PREFIX = "collection-ack:";
const POLL_INTERVAL_MS = 10000;
/** style 画面などからの即時再チェック用イベント */
export const COLLECTION_PROGRESS_REFRESH_EVENT = "collection-progress-refresh";

function getAck(categoryKey: string): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(ACK_PREFIX + categoryKey);
  const n = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

function setAck(categoryKey: string, count: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACK_PREFIX + categoryKey, String(count));
}

function buildPublicMountUrl(path: string | null): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/generated-images/${path}`;
}

export interface CollectionComposerTarget {
  categoryKey: string;
  displayName: string;
  threshold: number;
  toCount: number;
  characterImageUrl: string | null;
}

/**
 * 全画面共通のコレクション進捗監視フック。
 * - 10秒ポーリング + イベントで進捗を取得
 * - ack(最後に通知した種類数)より増えたシリーズを検知:
 *   - N 到達かつ未完了 → 画像選択コンポーザを開く(自動生成はしない)
 *   - それ以外(途中経過・既に完了済み) → 進捗モーダル(celebration)
 * - 台紙生成はコンポーザ側で行う(成功/閉じる時に ack して再オープンを抑止)
 */
export function useCollectionProgress() {
  const [celebration, setCelebration] = useState<CollectionCelebration | null>(
    null,
  );
  const [composer, setComposer] = useState<CollectionComposerTarget | null>(
    null,
  );
  const celebrationRef = useRef<CollectionCelebration | null>(null);
  celebrationRef.current = celebration;
  const composerRef = useRef<CollectionComposerTarget | null>(null);
  composerRef.current = composer;
  const processingRef = useRef(false);

  const evaluate = useCallback(async () => {
    if (processingRef.current) return;
    // 既にモーダル/コンポーザ表示中は新規検知しない(多重表示防止)
    if (celebrationRef.current || composerRef.current) return;
    processingRef.current = true;
    try {
      const res = await fetch("/api/collections/progress", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { items?: CollectionProgress[] };
      const items = data.items ?? [];

      for (const series of items) {
        const acked = getAck(series.categoryKey);
        if (series.uniqueOutfitCount <= acked) continue;

        const fromCount = acked;
        const toCount = series.uniqueOutfitCount;

        if (
          toCount >= series.completionThreshold &&
          series.mountStatus !== "completed"
        ) {
          // 台紙未完成 → 画像選択コンポーザを開く(ack は生成 or 閉じる時)
          setComposer({
            categoryKey: series.categoryKey,
            displayName: series.displayNameJa,
            threshold: series.completionThreshold,
            toCount,
            characterImageUrl: series.characterImageUrl,
          });
          return;
        }

        // 途中経過 or 既に完了済み → 進捗モーダル
        setAck(series.categoryKey, toCount);
        setCelebration({
          categoryKey: series.categoryKey,
          displayName: series.displayNameJa,
          fromCount,
          toCount,
          threshold: series.completionThreshold,
          isCompleted: series.isCompleted,
          mountImageUrl: buildPublicMountUrl(series.mountImagePath),
          sharePath: null,
          completionId: null,
          characterImageUrl: series.characterImageUrl,
          collectedImageUrls: series.collectedImageUrls ?? [],
        });
        break;
      }
    } catch {
      // ネットワーク等の失敗は無視(次回ポーリングで再評価)
    } finally {
      processingRef.current = false;
    }
  }, []);

  const dismiss = useCallback(() => {
    setCelebration(null);
    window.setTimeout(() => {
      void evaluate();
    }, 300);
  }, [evaluate]);

  const onComposerGenerated = useCallback((result: MountGeneratedResult) => {
    const target = composerRef.current;
    if (target) setAck(target.categoryKey, target.toCount);
    setComposer(null);
    setCelebration({
      categoryKey: result.categoryKey,
      displayName: target?.displayName ?? "",
      fromCount: 0,
      toCount: target?.threshold ?? 0,
      threshold: target?.threshold ?? 0,
      isCompleted: true,
      mountImageUrl: result.mountImageUrl,
      sharePath: result.sharePath,
      completionId: result.completionId,
      characterImageUrl: target?.characterImageUrl ?? null,
      collectedImageUrls: [],
    });
  }, []);

  const closeComposer = useCallback(() => {
    const target = composerRef.current;
    // 閉じた場合も ack して再オープンを抑止(あとからマイページの「台紙を作る」で生成可能)
    if (target) setAck(target.categoryKey, target.toCount);
    setComposer(null);
  }, []);

  useEffect(() => {
    void evaluate();
    const interval = window.setInterval(() => {
      void evaluate();
    }, POLL_INTERVAL_MS);
    const onRefresh = () => {
      void evaluate();
    };
    window.addEventListener(COLLECTION_PROGRESS_REFRESH_EVENT, onRefresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener(COLLECTION_PROGRESS_REFRESH_EVENT, onRefresh);
    };
  }, [evaluate]);

  return { celebration, dismiss, composer, closeComposer, onComposerGenerated };
}
