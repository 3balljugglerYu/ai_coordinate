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

  const evaluate = useCallback(
    async (opts?: {
      preview?: { key: string; to?: number; from?: number };
    }) => {
    if (processingRef.current) return;
    // 既にモーダル/コンポーザ表示中は新規検知しない(多重表示防止)
    if (celebrationRef.current || composerRef.current) return;
    processingRef.current = true;
    try {
      const res = await fetch("/api/collections/progress", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        items?: CollectionProgress[];
        isAdminViewer?: boolean;
      };
      const items = data.items ?? [];

      // admin 限定プレビュー: 公開前の表示確認用に進捗モーダルを任意状態で再表示する。
      //   ?collection_reset=<categoryKey|1>            … 実データの現在状態を再表示
      //   ?collection_reset=<key>&collection_to=4      … 4個埋まった進捗ビューを強制
      //   ?collection_reset=<key>&collection_to=4&collection_from=3 … 4個目が埋まる瞬間
      // collection_to を指定すると、コンプリート済みでも完了ビューに切り替えず進捗ビュー
      // (枠が埋まる演出)を表示する。一般ユーザーが踏んでも isAdminViewer が false なら無視。
      // ack には触れない(実進捗を汚さない)。
      if (opts?.preview && data.isAdminViewer === true) {
        const { key, to: rawTo, from: rawFrom } = opts.preview;
        const target =
          key === "1"
            ? items[0]
            : items.find((s) => s.categoryKey === key);
        if (target) {
          const threshold = target.completionThreshold;
          const hasTo = typeof rawTo === "number" && Number.isFinite(rawTo);
          const toCount = hasTo
            ? Math.max(1, Math.min(rawTo as number, threshold))
            : target.uniqueOutfitCount;
          const fromCount =
            typeof rawFrom === "number" && Number.isFinite(rawFrom)
              ? Math.max(0, Math.min(rawFrom, toCount))
              : 0;
          // to を明示したときは進捗ビューを強制(完了ビューに切り替えない)。
          // 未指定なら実データの完了状態を尊重する。
          const completed = hasTo
            ? toCount >= threshold && target.isCompleted
            : target.isCompleted;
          setCelebration({
            categoryKey: target.categoryKey,
            displayName: target.displayNameJa,
            fromCount,
            toCount,
            threshold,
            isCompleted: completed,
            mountImageUrl: completed
              ? buildPublicMountUrl(target.mountImagePath)
              : null,
            sharePath:
              completed && target.completionId
                ? `/m/${target.completionId}`
                : null,
            completionId: completed ? target.completionId : null,
            characterImageUrl: target.characterImageUrl,
            collectedImageUrls: (target.collectedImageUrls ?? []).slice(
              0,
              toCount,
            ),
            celebrationEffect: "sparkle",
          });
        }
        return;
      }

      for (const series of items) {
        const acked = getAck(series.categoryKey);
        if (series.uniqueOutfitCount <= acked) continue;

        const fromCount = acked;
        const toCount = series.uniqueOutfitCount;

        // 「N種到達 + 台紙未完成」も含めて、まず進捗モーダル(100%アニメ)を見せる。
        // モーダル内の「台紙を作成する」ボタン押下時に composer を開く流れにする。
        // ack はここで進める(次回からはモーダルを開かない)。
        setAck(series.categoryKey, toCount);
        setCelebration({
          categoryKey: series.categoryKey,
          displayName: series.displayNameJa,
          fromCount,
          toCount,
          threshold: series.completionThreshold,
          isCompleted: series.isCompleted,
          mountImageUrl: buildPublicMountUrl(series.mountImagePath),
          // 完了台紙が確定しているシリーズはシェア導線(台紙シェア/シェアページ)を出す。
          // マイページの完了サムネタップ(openMountModal)と同じ挙動に揃える。
          sharePath: series.completionId ? `/m/${series.completionId}` : null,
          completionId: series.completionId,
          characterImageUrl: series.characterImageUrl,
          collectedImageUrls: series.collectedImageUrls ?? [],
          // フィードの自動コンプリート祝いはダイヤのきらめき演出にする。
          celebrationEffect: "sparkle",
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

  /**
   * モーダルの「台紙を作成する」ボタン押下時。
   * モーダルを閉じてから、画像選択コンポーザを開く。
   */
  const openComposerFromCelebration = useCallback(
    (c: CollectionCelebration) => {
      setCelebration(null);
      setComposer({
        categoryKey: c.categoryKey,
        displayName: c.displayName,
        threshold: c.threshold,
        toCount: c.toCount,
        characterImageUrl: c.characterImageUrl,
      });
    },
    [],
  );

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
    // 初回のみ ?collection_reset / collection_to / collection_from を読み、
    // admin プレビューの再表示に使う。以降のポーリングには渡さない(一度きり)。
    const params =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : null;
    const resetKey = params?.get("collection_reset") ?? null;
    if (resetKey) {
      const toRaw = params?.get("collection_to");
      const fromRaw = params?.get("collection_from");
      void evaluate({
        preview: {
          key: resetKey,
          to: toRaw != null ? Number.parseInt(toRaw, 10) : undefined,
          from: fromRaw != null ? Number.parseInt(fromRaw, 10) : undefined,
        },
      });
    } else {
      void evaluate();
    }
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

  return {
    celebration,
    dismiss,
    composer,
    closeComposer,
    onComposerGenerated,
    openComposerFromCelebration,
  };
}
