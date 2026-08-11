"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** 1リクエストあたりの上限（API 側の Zod と揃える）。 */
const BATCH_SIZE = 100;

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
  /*
    取得中に依存配列が変わっても結果を捨てないよう、中断はアンマウント時だけに限る。
    effect ごとの cancelled フラグにすると、フィードでサマリが届いて authorIds が
    作り直された瞬間に、進行中のフォロー状態取得が丸ごと破棄されてしまう。
  */
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ログインし直したら、前の閲覧者のフォロー状態は無効になる。
  // 初回マウントでは何も持っていないので走らせない(余計な再レンダーを避ける)。
  const previousUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (previousUserIdRef.current === undefined) {
      previousUserIdRef.current = currentUserId;
      return;
    }
    if (previousUserIdRef.current === currentUserId) {
      return;
    }
    previousUserIdRef.current = currentUserId;
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

    (async () => {
      // 未取得ぶんを API の上限ごとに分けて**全部**送る。
      // 先頭だけ送ると、上限を超えた作者のフォロー状態が永久に未取得のままになる
      // (posts が変わらない限り effect は再実行されないため)。
      for (let index = 0; index < pending.length; index += BATCH_SIZE) {
        const batch = pending.slice(index, index + BATCH_SIZE);
        try {
          const response = await fetch("/api/users/follow-status/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_ids: batch }),
          });
          if (!response.ok) {
            throw new Error(`follow-status batch failed: ${response.status}`);
          }
          const data = (await response.json()) as {
            following?: Record<string, boolean>;
          };
          if (!isMountedRef.current) {
            return;
          }
          if (data.following) {
            setStatuses((prev) => ({ ...prev, ...data.following }));
          }
        } catch (error) {
          console.error("Failed to fetch follow statuses:", error);
          // 取得できなかった相手は再取得できるようにしておく
          batch.forEach((id) => requestedRef.current.delete(id));
        }
      }
    })();
  }, [authorIds, currentUserId, enabled]);

  /** カード内のフォローボタンで状態が変わったときに親の値も合わせる。 */
  const setFollowStatus = useCallback((userId: string, isFollowing: boolean) => {
    requestedRef.current.add(userId);
    setStatuses((prev) => ({ ...prev, [userId]: isFollowing }));
  }, []);

  return { followStatuses: statuses, setFollowStatus };
}
