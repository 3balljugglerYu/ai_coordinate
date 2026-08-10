"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * フィードに並ぶ作者へのフォロー状態をまとめて解決するフック。
 *
 * カードごとに `/api/users/[userId]/follow-status` を呼ぶと、20件のフィードで
 * 20リクエストになり、スクロールのたびに増える。ここでバッチ API に寄せる。
 *
 * - 未取得の作者だけを問い合わせる(スクロールで追加された分だけ増分取得する)
 * - フィード表示中だけ動く(グリッドでは呼ばない = 取得コストを増やさない)
 * - 失敗しても投げない。フォロー状態が分からないときは「未フォロー」として
 *   扱われるが、押せば正しい結果になるので操作は詰まらない
 */
export function useFeedFollowStatus(
  authorIds: string[],
  currentUserId: string | null,
  enabled: boolean
) {
  const [statuses, setStatuses] = useState<Record<string, boolean>>({});
  // 問い合わせ済み(取得中を含む)の作者。二重取得を防ぐ。
  const requestedRef = useRef<Set<string>>(new Set());

  // ログインし直したら、前の閲覧者のフォロー状態は無効になる。
  useEffect(() => {
    requestedRef.current = new Set();
    setStatuses({});
  }, [currentUserId]);

  useEffect(() => {
    if (!enabled || !currentUserId) {
      return;
    }
    const pending = authorIds.filter(
      (id) => id && id !== currentUserId && !requestedRef.current.has(id)
    );
    if (pending.length === 0) {
      return;
    }
    pending.forEach((id) => requestedRef.current.add(id));

    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/users/follow-status/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // API 側の上限に合わせる。超える分は次のレンダーで拾われる。
          body: JSON.stringify({ user_ids: pending.slice(0, 100) }),
        });
        if (!response.ok) {
          throw new Error(`follow-status batch failed: ${response.status}`);
        }
        const data = (await response.json()) as {
          following?: Record<string, boolean>;
        };
        if (cancelled || !data.following) {
          return;
        }
        setStatuses((prev) => ({ ...prev, ...data.following }));
      } catch (error) {
        console.error("Failed to fetch follow statuses:", error);
        // 取得できなかった相手は再取得できるようにしておく
        pending.forEach((id) => requestedRef.current.delete(id));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authorIds, currentUserId, enabled]);

  /** カード内のフォローボタンで状態が変わったときに親の値も合わせる。 */
  const setFollowStatus = useCallback((userId: string, isFollowing: boolean) => {
    requestedRef.current.add(userId);
    setStatuses((prev) => ({ ...prev, [userId]: isFollowing }));
  }, []);

  return { followStatuses: statuses, setFollowStatus };
}
