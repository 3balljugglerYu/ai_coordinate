"use client";

import { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import { useInView } from "react-intersection-observer";
import { CommentItem } from "./CommentItem";
import { getCommentsAPI } from "../lib/api";
import { createClient } from "@/lib/supabase/client";

interface Comment {
  id: string;
  user_id: string;
  image_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

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
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const { ref: inViewRef, inView } = useInView({
    threshold: 0,
    rootMargin: "200px",
  });

  const loadComments = useCallback(
    async (newOffset: number, reset: boolean = false) => {
      setIsLoading(true);
      try {
        const newComments = await getCommentsAPI(
          imageId,
          COMMENTS_PER_PAGE,
          newOffset
        );

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
        setIsLoading(false);
      }
    },
    [imageId]
  );

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
          // 自分の操作はオプティミスティックUIで既に反映済みなので、Realtimeイベントでは追加しない
          if (payload.new && (payload.new as any).user_id === currentUserId) {
            return;
          }

          if (payload.eventType === "INSERT" && payload.new) {
            const newComment = payload.new as Comment;
            // 削除されていないコメントのみ追加
            if (!newComment.deleted_at) {
              setComments((prev) => [newComment, ...prev]);
              // コメントが追加されたことを親コンポーネントに通知
              onCommentAdded?.();
            }
          } else if (payload.eventType === "UPDATE" && payload.new) {
            const updatedComment = payload.new as Comment;
            // 削除された場合はリストから削除
            if (updatedComment.deleted_at) {
              setComments((prev) =>
                prev.filter((c) => c.id !== updatedComment.id)
              );
            } else {
              // 更新された場合は置き換え
              setComments((prev) =>
                prev.map((c) =>
                  c.id === updatedComment.id ? updatedComment : c
                )
              );
            }
          } else if (payload.eventType === "DELETE" || (payload.old && (payload.old as any).deleted_at)) {
            // 削除された場合はリストから削除
            const deletedCommentId = (payload.old as any)?.id;
            if (deletedCommentId) {
              setComments((prev) =>
                prev.filter((c) => c.id !== deletedCommentId)
              );
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [imageId, currentUserId]);

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
        まだコメントがありません
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
        />
      ))}

      {/* 無限スクロール用のトリガー要素 */}
      {hasMore && (
        <div ref={inViewRef} className="py-4 text-center">
          {isLoading && (
            <div className="text-sm text-gray-500">読み込み中...</div>
          )}
        </div>
      )}

      {/* 全て読み込み完了時のメッセージ */}
      {!hasMore && comments.length > 0 && (
        <div className="py-4 text-center text-sm text-gray-500">
          全てのコメントを表示しました
        </div>
      )}
    </div>
  );
  }
);

