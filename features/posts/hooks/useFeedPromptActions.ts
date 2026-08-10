"use client";

import { useEffect, useRef, useState } from "react";
import type { PromptActionSummary } from "../types";

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
  // 問い合わせ済み(取得中を含む)の投稿。二重取得を防ぐ。
  const requestedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const pending = postIds.filter((id) => id && !requestedRef.current.has(id));
    if (pending.length === 0) {
      return;
    }
    // API 側の上限に合わせる。超える分は次のレンダーで拾われる。
    const batch = pending.slice(0, 50);
    batch.forEach((id) => requestedRef.current.add(id));

    let cancelled = false;
    (async () => {
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
        };
        if (cancelled || !data.summaries) {
          return;
        }
        setSummaries((prev) => ({ ...prev, ...data.summaries }));
      } catch (error) {
        console.error("Failed to fetch prompt action summaries:", error);
        batch.forEach((id) => requestedRef.current.delete(id));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [postIds, enabled]);

  return summaries;
}
