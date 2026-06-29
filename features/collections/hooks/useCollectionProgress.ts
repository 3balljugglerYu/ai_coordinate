"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CollectionProgress } from "@/features/collections/lib/collection-types";
import type { CollectionCelebration } from "@/features/collections/components/CollectionProgressModal";
import type { MountGeneratedResult } from "@/features/collections/components/CollectionMountComposer";
import {
  getCollectionAck as getAck,
  setCollectionAck as setAck,
} from "@/features/collections/lib/collection-ack";

const POLL_INTERVAL_MS = 10000;
/** style 画面などからの即時再チェック用イベント */
export const COLLECTION_PROGRESS_REFRESH_EVENT = "collection-progress-refresh";
/**
 * 進捗モーダルを閉じたときに発火するイベント。detail.categoryKey に閉じたカテゴリを載せる。
 * 段階解放モーダル(B)を進捗モーダルのクローズ直後に出すため CollectionUnlockDripListener が購読する。
 */
export const COLLECTION_PROGRESS_DISMISSED_EVENT =
  "collection-progress-dismissed";

function buildPublicMountUrl(path: string | null): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/generated-images/${path}`;
}

/**
 * 完了モーダルの「シェアページへ」遷移先。book は redirect 元の /m/<id>(chrome付き)を
 * 経由するとアプリシェルがチラつくため、最初から没入の /m/<id>/book へ直接遷移させる。
 */
function collectionSharePath(
  completionId: string | null,
  viewMode: "mount" | "book" | undefined,
): string | null {
  if (!completionId) return null;
  return viewMode === "book"
    ? `/m/${completionId}/book`
    : `/m/${completionId}`;
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
  // リトライ(setTimeout)待機中などにアンマウントされた後、不要な fetch /
  // state 更新を走らせないためのマウント状態フラグ。effect 開始時に true へ
  // 戻すことで StrictMode の二重マウントにも対応する。
  const isMountedRef = useRef(true);

  // 戻り値: 新たに表示した/既に表示中なら true、増分なし/取得失敗なら false。
  // false のときは即時イベント側で短いバックオフ再評価を行う(読み取り競合対策)。
  const evaluate = useCallback(
    async (opts?: {
      preview?: { key: string; to?: number; from?: number };
    }): Promise<boolean> => {
    // アンマウント後は何もしない。
    if (!isMountedRef.current) return false;
    // 別評価が実行中。リトライ側で再試行させるため false を返す。
    if (processingRef.current) return false;
    // 既にモーダル/コンポーザ表示中は新規検知しない(多重表示防止)。表示済みなので true。
    if (celebrationRef.current || composerRef.current) return true;
    processingRef.current = true;
    try {
      const res = await fetch("/api/collections/progress", {
        cache: "no-store",
      });
      if (!res.ok) return false;
      const data = (await res.json()) as {
        items?: CollectionProgress[];
        isAdminViewer?: boolean;
      };
      const items = data.items ?? [];

      // admin 限定プレビュー: 公開前の表示確認用に進捗モーダルを任意状態で再表示する。
      //   ?collection_reset=<categoryKey|1>            … 実データの現在状態を再表示
      //   ?collection_reset=<key>&collection_to=4      … 4個埋まった進捗ビューを強制
      //   ?collection_reset=<key>&collection_to=6&collection_from=5 … 6個目が埋まり100%になる瞬間
      // collection_from を併せて指定すると、コンプリート済みでも完了ビューに切り替えず
      // 進捗ビュー(枠が埋まる100%演出)を強制表示する。from 未指定で to>=閾値かつ実データ完了の
      // ときだけ完了(台紙)ビューを出す。一般ユーザーが踏んでも isAdminViewer が false なら無視。
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
          const hasFrom =
            typeof rawFrom === "number" && Number.isFinite(rawFrom);
          const fromCount = hasFrom
            ? Math.max(0, Math.min(rawFrom as number, toCount))
            : 0;
          // collection_from を併せて指定したときは「枠が埋まる100%アニメ」を見たい意図なので、
          // コンプリート済みでも完了ビューに切り替えず進捗ビューを強制する。
          // from 未指定 + to>=閾値 + 実データ完了 のときだけ完了(台紙)ビューを出す。
          const completed = hasFrom
            ? false
            : hasTo
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
            sharePath: completed
              ? collectionSharePath(
                  target.completionId,
                  target.completionViewMode,
                )
              : null,
            completionId: completed ? target.completionId : null,
            mountTemplateWidth: target.mountTemplateWidth,
            mountTemplateHeight: target.mountTemplateHeight,
            characterImageUrl: target.characterImageUrl,
            collectedImageUrls: (target.collectedImageUrls ?? []).slice(
              0,
              toCount,
            ),
            progressModalFrameUrl: target.progressModalFrameUrl,
            progressModalFrameWidth: target.progressModalFrameWidth,
            progressModalFrameHeight: target.progressModalFrameHeight,
            progressModalSlots: target.progressModalSlots,
            progressModalButton: target.progressModalButton,
            progressModalCenter: target.progressModalCenter,
            progressModalRingColor: target.progressModalRingColor,
            progressModalBadgeColor: target.progressModalBadgeColor,
            progressModalBadgeTextColor: target.progressModalBadgeTextColor,
            progressModalBadgeBgColor: target.progressModalBadgeBgColor,
            progressModalButtonColor: target.progressModalButtonColor,
            progressModalButtonTextColor: target.progressModalButtonTextColor,
            // 完走(N種到達)時は紙吹雪、収集途中はきらめき。
            celebrationEffect: toCount >= threshold ? "confetti" : "sparkle",
          });
          return true;
        }
        return false;
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
          sharePath: collectionSharePath(
            series.completionId,
            series.completionViewMode,
          ),
          completionId: series.completionId,
          mountTemplateWidth: series.mountTemplateWidth,
          mountTemplateHeight: series.mountTemplateHeight,
          characterImageUrl: series.characterImageUrl,
          collectedImageUrls: series.collectedImageUrls ?? [],
          progressModalFrameUrl: series.progressModalFrameUrl,
          progressModalFrameWidth: series.progressModalFrameWidth,
          progressModalFrameHeight: series.progressModalFrameHeight,
          progressModalSlots: series.progressModalSlots,
          progressModalButton: series.progressModalButton,
          progressModalCenter: series.progressModalCenter,
          progressModalRingColor: series.progressModalRingColor,
          progressModalBadgeColor: series.progressModalBadgeColor,
          progressModalBadgeTextColor: series.progressModalBadgeTextColor,
          progressModalBadgeBgColor: series.progressModalBadgeBgColor,
          progressModalButtonColor: series.progressModalButtonColor,
          progressModalButtonTextColor: series.progressModalButtonTextColor,
          // 完走(N種到達)時は紙吹雪で祝い、収集途中はきらめき演出にする。
          celebrationEffect:
            toCount >= series.completionThreshold ? "confetti" : "sparkle",
        });
        return true;
      }
      // どのシリーズも増分なし。即時イベント側でリトライ対象にするため false。
      return false;
    } catch {
      // ネットワーク等の失敗は無視(次回ポーリング/リトライで再評価)
      return false;
    } finally {
      processingRef.current = false;
    }
  }, []);

  // 即時イベント(style 生成完了)用のリトライ付き評価。
  // 生成直後は image_jobs.status='succeeded' が RPC に反映される前に
  // evaluate() が走ると増分を検知できないため(読み取り競合)、表示できる
  // まで短いバックオフで数回だけ再評価する。ポーリングはリトライ不要なので
  // 素の evaluate() を使う。
  const evaluateWithRetry = useCallback(async () => {
    const RETRY_DELAYS_MS = [1500, 4000];
    if (await evaluate()) return;
    for (const delay of RETRY_DELAYS_MS) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, delay);
      });
      // 待機中にアンマウントされたら以降の評価(fetch)を行わない。
      if (!isMountedRef.current) return;
      // 待機中に他経路(ポーリング等)で表示済みになったら打ち切る。
      if (celebrationRef.current || composerRef.current) return;
      if (await evaluate()) return;
    }
  }, [evaluate]);

  const dismiss = useCallback(() => {
    // 閉じたカテゴリ key を控えてからモーダルを閉じ、段階解放モーダル(B)の判定用に通知する。
    const dismissedKey = celebrationRef.current?.categoryKey ?? null;
    setCelebration(null);
    if (dismissedKey && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(COLLECTION_PROGRESS_DISMISSED_EVENT, {
          detail: { categoryKey: dismissedKey },
        }),
      );
    }
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
      mountTemplateWidth: result.mountTemplateWidth,
      mountTemplateHeight: result.mountTemplateHeight,
      characterImageUrl: target?.characterImageUrl ?? null,
      collectedImageUrls: [],
      // コンポーザ生成後は完了台紙(showMount)を表示するため進捗モーダルレイアウトは不要。
      progressModalFrameUrl: null,
      progressModalFrameWidth: null,
      progressModalFrameHeight: null,
      progressModalSlots: null,
      progressModalButton: null,
      progressModalCenter: null,
      progressModalRingColor: null,
      progressModalBadgeColor: null,
      progressModalBadgeTextColor: null,
      progressModalBadgeBgColor: null,
      progressModalButtonColor: null,
      progressModalButtonTextColor: null,
    });
  }, []);

  const closeComposer = useCallback(() => {
    const target = composerRef.current;
    // 閉じた場合も ack して再オープンを抑止(あとからマイページの「台紙を作る」で生成可能)
    if (target) setAck(target.categoryKey, target.toCount);
    setComposer(null);
  }, []);

  useEffect(() => {
    // StrictMode の再マウントでも再開できるよう、effect 開始時に true へ戻す。
    isMountedRef.current = true;
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
    // style 生成完了などの即時トリガーは、読み取り競合で初回が空振りしても
    // 表示できるまで短いバックオフで再評価する。
    const onRefresh = () => {
      void evaluateWithRetry();
    };
    window.addEventListener(COLLECTION_PROGRESS_REFRESH_EVENT, onRefresh);
    return () => {
      // アンマウント後はリトライ待機中の再評価(fetch / state 更新)を止める。
      isMountedRef.current = false;
      window.clearInterval(interval);
      window.removeEventListener(COLLECTION_PROGRESS_REFRESH_EVENT, onRefresh);
    };
  }, [evaluate, evaluateWithRetry]);

  return {
    celebration,
    dismiss,
    composer,
    closeComposer,
    onComposerGenerated,
    openComposerFromCelebration,
  };
}
