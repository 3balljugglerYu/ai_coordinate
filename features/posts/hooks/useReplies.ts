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
  const requestSequenceRef = useRef(0);
  const inFlightKeysRef = useRef<Set<string>>(new Set());
  const pendingRequestsRef = useRef(0);

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
          }
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
        pendingRequestsRef.current = Math.max(0, pendingRequestsRef.current - 1);

        if (pendingRequestsRef.current === 0) {
          setIsLoading(false);
        }
      }
    },
    [parentCommentId, t]
  );

  const refreshReplies = useCallback(async () => {
    await loadReplies(0, true);
  }, [loadReplies]);

  useEffect(() => {
    setReplies([]);
    setHasMore(false);
    setOffset(0);
    requestSequenceRef.current = 0;
    inFlightKeysRef.current.clear();
    pendingRequestsRef.current = 0;
    setIsLoading(false);
  }, [parentCommentId]);

  useEffect(() => {
    if (!enabled || parentReplyCount === 0) {
      return;
    }

    if (replies.length > 0 && replies.length === parentReplyCount && !hasMore) {
      return;
    }

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

          if (payload.event_type === "INSERT" || payload.event_type === "DELETE") {
            void refreshReplies();
            onReplyCountChanged?.();
          }
        }
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
                      : updatedReply.content ?? reply.content,
                    deleted_at: updatedReply.deleted_at ?? reply.deleted_at,
                    updated_at: updatedReply.updated_at ?? reply.updated_at,
                  }
                : reply
            )
          );
        }
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
    loadReplies,
    refreshReplies,
  };
}
