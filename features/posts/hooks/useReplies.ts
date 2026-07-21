"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { getRepliesAPI } from "../lib/api";
import type { ReplyComment } from "../types";

const REPLIES_PER_PAGE = 20;

type ReplyLifecyclePayload = {
  event_type?: "INSERT" | "DELETE";
  image_id?: string;
  parent_comment_id?: string;
  comment_id?: string;
  user_id?: string | null;
};

type ReplyRealtimeRow = {
  id?: string;
  user_id?: string | null;
  content?: string;
  updated_at?: string;
  deleted_at?: string | null;
};

interface UseRepliesOptions {
  parentCommentId: string;
  parentReplyCount: number;
  currentUserId?: string | null;
  enabled: boolean;
  onReplyCountChanged?: () => void;
}

export function useReplies({
  parentCommentId,
  parentReplyCount,
  currentUserId,
  enabled,
  onReplyCountChanged,
}: UseRepliesOptions) {
  const t = useTranslations("posts");
  const [replies, setReplies] = useState<ReplyComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasResolvedInitialLoad, setHasResolvedInitialLoad] = useState(
    parentReplyCount === 0,
  );
  const requestSequenceRef = useRef(0);
  const inFlightKeysRef = useRef<Set<string>>(new Set());
  const pendingRequestsRef = useRef(0);
  // 件数同期を実施済みの parentReplyCount。同じ件数に対して繰り返し
  // refresh しないためのガード(下の件数同期 effect を参照)。
  const lastSyncedCountRef = useRef<number | null>(null);

  const loadReplies = useCallback(
    async (nextOffset: number, reset = false) => {
      const requestKey = `${nextOffset}:${reset ? "reset" : "append"}`;
      if (inFlightKeysRef.current.has(requestKey)) {
        return;
      }

      inFlightKeysRef.current.add(requestKey);
      pendingRequestsRef.current += 1;
      setIsLoading(true);
      const requestId = ++requestSequenceRef.current;

      try {
        const nextReplies = await getRepliesAPI(
          parentCommentId,
          REPLIES_PER_PAGE,
          nextOffset,
          {
            repliesFetchFailed: t("repliesFetchFailed"),
          },
        );

        if (requestId !== requestSequenceRef.current) {
          return;
        }

        if (reset) {
          setReplies(nextReplies);
          setOffset(nextReplies.length);
        } else {
          setReplies((prev) => [...prev, ...nextReplies]);
          setOffset((prev) => prev + nextReplies.length);
        }

        setHasMore(nextReplies.length === REPLIES_PER_PAGE);
      } catch (error) {
        console.error("Failed to load replies:", error);
      } finally {
        inFlightKeysRef.current.delete(requestKey);
        pendingRequestsRef.current = Math.max(
          0,
          pendingRequestsRef.current - 1,
        );
        // 古い(打ち切られた)リクエストが「読み込み完了」を立てると、
        // リスト空 + 完了済み = 「まだ返信はありません」の誤表示が起きるため、
        // 最新リクエストのみが完了フラグを立てる。
        if (requestId === requestSequenceRef.current) {
          setHasResolvedInitialLoad(true);
        }

        if (pendingRequestsRef.current === 0) {
          setIsLoading(false);
        }
      }
    },
    [parentCommentId, t],
  );

  const refreshReplies = useCallback(async () => {
    await loadReplies(0, true);
  }, [loadReplies]);

  // フルリセットは「別の親スレッドに切り替わったとき」のみ。
  // parentReplyCount の変化(自分の投稿後の親更新や realtime)ではリストを
  // 消さない。消すと「空リスト+読み込み済み」の瞬間が生まれ、
  // 「まだ返信はありません」が一瞬表示される。既存リストを表示したまま、
  // 下の enabled effect が件数不一致を検知して refresh し、届いた時点で
  // 差し替える。
  useEffect(() => {
    setReplies([]);
    setHasMore(false);
    setOffset(0);
    setHasResolvedInitialLoad(parentReplyCount === 0);
    requestSequenceRef.current = 0;
    inFlightKeysRef.current.clear();
    pendingRequestsRef.current = 0;
    lastSyncedCountRef.current = null;
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentCommentId]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (parentReplyCount === 0) {
      // 返信が0件になった場合、読み込み済みリストが残っていればクリアする
      // (parentReplyCount 変化ではフルリセットしなくなったため、ここで整合させる)。
      setReplies((prev) => (prev.length > 0 ? [] : prev));
      setHasMore(false);
      setOffset(0);
      setHasResolvedInitialLoad(true);
      lastSyncedCountRef.current = 0;
      return;
    }

    // 同じ parentReplyCount に対する同期(リセット取得)は一度だけ行う。
    // ページ追加読み込みで replies.length が変わるたびに refresh すると、
    // 読み込んだ後続ページが offset 0 のリセットで置き換えられてしまう
    // (ディープリンクのページ跨ぎ探索で見つけた対象が消える)。
    if (lastSyncedCountRef.current === parentReplyCount) {
      return;
    }

    if (replies.length > 0 && replies.length === parentReplyCount && !hasMore) {
      lastSyncedCountRef.current = parentReplyCount;
      setHasResolvedInitialLoad(true);
      return;
    }

    lastSyncedCountRef.current = parentReplyCount;
    void refreshReplies();
  }, [enabled, hasMore, parentReplyCount, refreshReplies, replies.length]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const supabase = createClient();
    const channel = supabase
      .channel(`comments:replies:${parentCommentId}`)
      .on(
        "broadcast",
        { event: "reply_lifecycle" },
        ({ payload }: { payload: ReplyLifecyclePayload }) => {
          if (payload.user_id && payload.user_id === currentUserId) {
            return;
          }

          if (
            payload.event_type === "INSERT" ||
            payload.event_type === "DELETE"
          ) {
            void refreshReplies();
            onReplyCountChanged?.();
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "comments",
          filter: `parent_comment_id=eq.${parentCommentId}`,
        },
        (payload) => {
          const updatedReply = payload.new as ReplyRealtimeRow | null;
          if (!updatedReply?.id) {
            return;
          }

          if (updatedReply.user_id && updatedReply.user_id === currentUserId) {
            return;
          }

          setReplies((prev) =>
            prev.map((reply) =>
              reply.id === updatedReply.id
                ? {
                    ...reply,
                    content: updatedReply.deleted_at
                      ? t("commentDeletedPlaceholder")
                      : (updatedReply.content ?? reply.content),
                    deleted_at: updatedReply.deleted_at ?? reply.deleted_at,
                    updated_at: updatedReply.updated_at ?? reply.updated_at,
                  }
                : reply,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    currentUserId,
    enabled,
    onReplyCountChanged,
    parentCommentId,
    refreshReplies,
    t,
  ]);

  return {
    replies,
    isLoading,
    hasMore,
    offset,
    hasResolvedInitialLoad,
    loadReplies,
    refreshReplies,
  };
}
