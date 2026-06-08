"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CollectionProgress } from "@/features/collections/lib/collection-types";
import type { CollectionCelebration } from "@/features/collections/components/CollectionProgressModal";

const ACK_PREFIX = "collection-ack:";
const POLL_INTERVAL_MS = 10000;
// 台紙生成が失敗し続けたときに 10秒ごとに叩き続けない(リトライストーム防止)。
// 失敗のたびに指数バックオフし、上限回数で打ち止め(セッション中は再試行しない)。
const MOUNT_RETRY_BASE_MS = 30_000;
const MOUNT_RETRY_MAX_MS = 5 * 60_000;
const MOUNT_MAX_FAILURES = 5;
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

/**
 * 全画面共通のコレクション進捗監視フック。
 * - 10秒ポーリング + イベント(COLLECTION_PROGRESS_REFRESH_EVENT)で進捗を取得
 * - localStorage の ack(最後に通知した種類数)より増えたシリーズを検知してモーダル発火
 * - N 到達かつ未完了なら台紙生成API を呼び、完了演出に切り替える
 * - ack は「UI表示の重複抑止」のみに使う(完了判定はサーバー側が真実)
 */
export function useCollectionProgress() {
  const [celebration, setCelebration] = useState<CollectionCelebration | null>(
    null,
  );
  const celebrationRef = useRef<CollectionCelebration | null>(null);
  celebrationRef.current = celebration;
  const processingRef = useRef(false);
  // categoryKey → 台紙生成のリトライ状態(連続失敗回数と次回試行可能時刻)
  const mountRetryRef = useRef<Map<string, { failures: number; nextAt: number }>>(
    new Map(),
  );

  const evaluate = useCallback(async () => {
    if (processingRef.current) return;
    // 既にモーダル表示中なら多重表示しない
    if (celebrationRef.current) return;
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
        let isCompleted = series.isCompleted;
        let mountImageUrl = buildPublicMountUrl(series.mountImagePath);
        let sharePath: string | null = null;
        let completionId: string | null = null;
        let mountPending = false;

        if (
          toCount >= series.completionThreshold &&
          series.mountStatus !== "completed"
        ) {
          const retry = mountRetryRef.current.get(series.categoryKey);
          if (retry && Date.now() < retry.nextAt) {
            // バックオフ中(または打ち止め): 今回はスキップ(ack せず次回以降に再評価)
            continue;
          }

          let failed = false;
          try {
            const mountRes = await fetch("/api/collections/mount", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ categoryKey: series.categoryKey }),
            });
            if (mountRes.ok) {
              const m = (await mountRes.json()) as {
                status?: string;
                mountImageUrl?: string;
                sharePath?: string;
              };
              if (m.status === "completed") {
                isCompleted = true;
                mountImageUrl = m.mountImageUrl ?? mountImageUrl;
                sharePath = m.sharePath ?? null;
                completionId = sharePath
                  ? sharePath.replace("/m/", "")
                  : null;
                mountRetryRef.current.delete(series.categoryKey);
              } else {
                // 202 等: 別フローが生成中。失敗扱いにせず次回ポーリングで再確認する
                mountPending = true;
              }
            } else {
              failed = true;
            }
          } catch {
            // 完了台紙が確定するまでは ack せず、次回ポーリングで再試行する
            failed = true;
          }

          if (failed) {
            const rec = mountRetryRef.current.get(series.categoryKey) ?? {
              failures: 0,
              nextAt: 0,
            };
            rec.failures += 1;
            rec.nextAt =
              rec.failures >= MOUNT_MAX_FAILURES
                ? Number.POSITIVE_INFINITY // 打ち止め(再読み込みまで自動再試行しない)
                : Date.now() +
                  Math.min(
                    MOUNT_RETRY_MAX_MS,
                    MOUNT_RETRY_BASE_MS * 2 ** (rec.failures - 1),
                  );
            mountRetryRef.current.set(series.categoryKey, rec);
            mountPending = true;
          }
        }

        if (mountPending) {
          continue;
        }

        setAck(series.categoryKey, toCount);
        setCelebration({
          categoryKey: series.categoryKey,
          displayName: series.displayNameJa,
          fromCount,
          toCount,
          threshold: series.completionThreshold,
          isCompleted,
          mountImageUrl,
          sharePath,
          completionId,
        });
        break; // 1件ずつ表示
      }
    } catch {
      // ネットワーク等の失敗は無視(次回ポーリングで再評価)
    } finally {
      processingRef.current = false;
    }
  }, []);

  const dismiss = useCallback(() => {
    setCelebration(null);
    // 次の対象シリーズがあれば続けて表示
    window.setTimeout(() => {
      void evaluate();
    }, 300);
  }, [evaluate]);

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

  return { celebration, dismiss };
}
