"use client";

import { useEffect, useRef, useState } from "react";
import type { PromptActionSummary, StylePresetLink } from "../types";

/** 1リクエストあたりの上限（API 側の Zod と揃える）。 */
const BATCH_SIZE = 50;

/**
 * フィードに並ぶ投稿の「このプロンプトで作る」サマリをまとめて解決するフック。
 *
 * - フィード表示中だけ動く(グリッドには CTA が無いので取得コストを増やさない)
 * - 未取得の投稿だけを問い合わせる(スクロールで追加された分だけ増分取得する)
 * - 失敗しても投げない。サマリが無い投稿は CTA を出さないだけで、
 *   詳細画面からは従来どおり生成できる(fail closed)
 */
export function useFeedPromptActions(postIds: string[], enabled: boolean) {
  const [summaries, setSummaries] = useState<Record<string, PromptActionSummary>>({});
  const [styleLinks, setStyleLinks] = useState<Record<string, StylePresetLink>>({});
  // 問い合わせ済み(取得中を含む)の投稿。二重取得を防ぐ。
  const requestedRef = useRef<Set<string>>(new Set());
  /*
    取得中に依存配列が変わっても結果を捨てないよう、中断はアンマウント時だけに限る。
    effect ごとの cancelled フラグにすると、無限スクロールで posts が伸びた瞬間に
    進行中のサマリ取得が丸ごと破棄され、CTA が出ないまま残る。
  */
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const pending = postIds.filter((id) => id && !requestedRef.current.has(id));
    if (pending.length === 0) {
      return;
    }
    pending.forEach((id) => requestedRef.current.add(id));

    (async () => {
      // 未取得ぶんを API の上限ごとに分けて**全部**送る。
      // 先頭だけ送って残りを次のレンダーに委ねると、グリッドで大量に読み込んだ後
      // フィードへ切り替えたときに posts が変わらず effect が再実行されないため、
      // 上限を超えた投稿の CTA が永久に出ないままになる。
      for (let index = 0; index < pending.length; index += BATCH_SIZE) {
        const batch = pending.slice(index, index + BATCH_SIZE);
        try {
          const response = await fetch("/api/posts/prompt-actions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ post_ids: batch }),
          });
          if (!response.ok) {
            throw new Error(`prompt-actions failed: ${response.status}`);
          }
          const data = (await response.json()) as {
            summaries?: Record<string, PromptActionSummary>;
            styleLinks?: Record<string, StylePresetLink>;
          };
          if (!isMountedRef.current) {
            return;
          }
          if (data.summaries) {
            setSummaries((prev) => ({ ...prev, ...data.summaries }));
          }
          if (data.styleLinks) {
            setStyleLinks((prev) => ({ ...prev, ...data.styleLinks }));
          }
        } catch (error) {
          console.error("Failed to fetch prompt action summaries:", error);
          // 取得できなかったぶんは再取得できるようにしておく
          batch.forEach((id) => requestedRef.current.delete(id));
        }
      }
    })();
  }, [postIds, enabled]);

  return { summaries, styleLinks };
}
