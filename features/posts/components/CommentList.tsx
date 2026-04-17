"use client";

import { useState, useEffect, useCallback, useImperativeHandle, forwardRef, useRef } from "react";
import { useInView } from "react-intersection-observer";
import { useTranslations } from "next-intl";
import { CommentItem } from "./CommentItem";
import { CommentLoadMoreSkeleton } from "./CommentLoadMoreSkeleton";
import { getCommentsAPI } from "../lib/api";
import type { ParentComment } from "../types";
import { createClient } from "@/lib/supabase/client";

type CommentRealtimeRow = {
  id?: string;
  user_id?: string | null;
  parent_comment_id?: string | null;
  content?: string;
  updated_at?: string;
  deleted_at?: string | null;
};

type ReplyLifecyclePayload = {
  event_type?: "INSERT" | "DELETE";
  image_id?: string;
  parent_comment_id?: string;
  comment_id?: string;
  user_id?: string | null;
};

interface CommentListProps {
  imageId: string;
  currentUserId?: string | null;
  onCommentAdded?: () => void;
}

export interface CommentListRef {
  refresh: () => void;
}

const COMMENTS_PER_PAGE = 20;

/**
 * コメント一覧コンポーネント
 * 無限スクロールとリアルタイム更新を実装
 */
export const CommentList = forwardRef<CommentListRef, CommentListProps>(
  function CommentList(
    {
      imageId,
      currentUserId,
      onCommentAdded,
    },
    ref
  ) {
  const t = useTranslations("posts");
  const [comments, setComments] = useState<ParentComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const requestSequenceRef = useRef(0);
  const inFlightKeysRef = useRef<Set<string>>(new Set());
  const pendingRequestsRef = useRef(0);
  const { ref: inViewRef, inView } = useInView({
    threshold: 0,
    rootMargin: "200px",
  });

  const loadComments = useCallback(
    async (newOffset: number, reset: boolean = false) => {
      const requestKey = `${newOffset}:${reset ? "reset" : "append"}`;
      if (inFlightKeysRef.current.has(requestKey)) {
        return;
      }

      inFlightKeysRef.current.add(requestKey);
      pendingRequestsRef.current += 1;
      setIsLoading(true);
      const requestId = ++requestSequenceRef.current;

      try {
        const newComments = await getCommentsAPI(
          imageId,
          COMMENTS_PER_PAGE,
          newOffset,
          {
            commentsFetchFailed: t("commentsFetchFailed"),
          }
        );

        if (requestId !== requestSequenceRef.current) {
          return;
        }

        if (reset) {
          setComments(newComments);
          setOffset(newComments.length);
        } else {
          setComments((prev) => [...prev, ...newComments]);
          setOffset((prev) => prev + newComments.length);
        }

        setHasMore(newComments.length === COMMENTS_PER_PAGE);
      } catch (error) {
        console.error("Failed to load comments:", error);
      } finally {
        inFlightKeysRef.current.delete(requestKey);
        pendingRequestsRef.current = Math.max(0, pendingRequestsRef.current - 1);

        if (pendingRequestsRef.current === 0) {
          setIsLoading(false);
        }
      }
    },
    [imageId, t]
  );

  const handleThreadChanged = useCallback(() => {
    loadComments(0, true);
  }, [loadComments]);

  // 親コンポーネントから呼び出せるrefresh関数を公開
  useImperativeHandle(ref, () => ({
    refresh: () => {
      loadComments(0, true);
    },
  }));

  // 初期読み込み
  useEffect(() => {
    loadComments(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageId]);

  // 無限スクロール
  useEffect(() => {
    if (inView && hasMore && !isLoading) {
      loadComments(offset, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, hasMore, isLoading, offset]);

  // リアルタイム更新の購読
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`comments:${imageId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comments",
          filter: `image_id=eq.${imageId}`,
        },
        (payload) => {
          const nextComment = payload.new as CommentRealtimeRow | null;
          const previousComment = payload.old as CommentRealtimeRow | null;

          if (nextComment?.parent_comment_id) {
            return;
          }

          if (previousComment?.parent_comment_id) {
            return;
          }

          // 自分の操作はオプティミスティックUIで既に反映済みなので、Realtimeイベントでは追加しない
          if (
            nextComment?.user_id === currentUserId ||
            previousComment?.user_id === currentUserId
          ) {
            return;
          }

          if (payload.eventType === "INSERT" && nextComment) {
            loadComments(0, true);
            return;
          }

          if (
            payload.eventType === "UPDATE" &&
            nextComment &&
            !previousComment?.deleted_at &&
            nextComment.deleted_at
          ) {
            setComments((prev) =>
              prev.map((comment) =>
                comment.id === nextComment.id
                  ? {
                      ...comment,
                      content: t("commentDeletedPlaceholder"),
                      deleted_at: nextComment.deleted_at ?? comment.deleted_at,
                      updated_at: nextComment.updated_at ?? comment.updated_at,
                    }
                  : comment
              )
            );
            return;
          }

          if (payload.eventType === "UPDATE" || payload.eventType === "DELETE") {
            loadComments(0, true);
          }
        }
      )
      .on(
        "broadcast",
        { event: "reply_lifecycle" },
        ({ payload }: { payload: ReplyLifecyclePayload }) => {
          if (payload.user_id && payload.user_id === currentUserId) {
            return;
          }

          if (payload.parent_comment_id) {
            loadComments(0, true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [imageId, currentUserId, loadComments, t]);

  const handleCommentUpdated = () => {
    // コメントが更新されたら再読み込み
    loadComments(0, true);
  };

  const handleCommentDeleted = () => {
    // コメントが削除されたら再読み込み
    loadComments(0, true);
    // コメントが削除されたことを親コンポーネントに通知
    onCommentAdded?.();
  };

  if (comments.length === 0 && !isLoading) {
    return (
      <div className="py-8 text-center text-sm text-gray-500">
        {t("noComments")}
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-200">
      {comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          currentUserId={currentUserId}
          onCommentUpdated={handleCommentUpdated}
          onCommentDeleted={handleCommentDeleted}
          onThreadChanged={handleThreadChanged}
        />
      ))}

      {/* 無限スクロール用のトリガー要素 */}
      {hasMore && (
        <div ref={inViewRef}>
          {isLoading && <CommentLoadMoreSkeleton />}
        </div>
      )}

      {/* 全て読み込み完了時のメッセージ */}
      {!hasMore && comments.length > 0 && (
        <div className="py-4 text-center text-sm text-gray-500">
          {t("allCommentsShown")}
        </div>
      )}
    </div>
  );
  }
);
