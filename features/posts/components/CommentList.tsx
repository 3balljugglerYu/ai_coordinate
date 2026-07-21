"use client";

import type { CSSProperties } from "react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useInView } from "react-intersection-observer";
import { useTranslations } from "next-intl";
import { CommentItem } from "./CommentItem";
import { CommentLoadMoreSkeleton } from "./CommentLoadMoreSkeleton";
import { ReplyPanel } from "./ReplyPanel";
import { getCommentsAPI } from "../lib/api";
import { REPLY_PANEL_MOBILE_BREAKPOINT } from "../lib/constants";
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

/** 通知タップ由来のディープリンク(対象の親コメントと、任意で返信)。 */
export interface CommentDeepLink {
  commentId: string;
  replyId: string | null;
}

interface CommentListProps {
  imageId: string;
  currentUserId?: string | null;
  onCommentAdded?: () => void;
  activeReplyCommentId?: string | null;
  replyPanelStyle?: CSSProperties | null;
  onReplyPanelOpen?: (commentId: string) => void;
  onReplyPanelOpenChange?: (open: boolean) => void;
  deepLink?: CommentDeepLink | null;
  /** ディープリンクの処理が完了(成功/断念)したときに呼ぶ(URLの後始末用)。 */
  onDeepLinkConsumed?: () => void;
}

export interface CommentListRef {
  refresh: () => void;
}

const COMMENTS_PER_PAGE = 20;

/** ディープリンク対象を探すための追加読み込み上限(20件x5=100件まで)。 */
const DEEP_LINK_MAX_PAGES = 5;

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
      activeReplyCommentId,
      replyPanelStyle,
      onReplyPanelOpen,
      onReplyPanelOpenChange,
      deepLink = null,
      onDeepLinkConsumed,
    },
    ref,
  ) {
    const t = useTranslations("posts");
    const [comments, setComments] = useState<ParentComment[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [offset, setOffset] = useState(0);
    // 初回読み込みが解決するまでディープリンク探索を開始しない
    // (初期リセット取得と探索の append 取得が二重発火しないように)。
    const [hasResolvedInitialLoad, setHasResolvedInitialLoad] = useState(false);
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
            },
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
          pendingRequestsRef.current = Math.max(
            0,
            pendingRequestsRef.current - 1,
          );

          if (requestId === requestSequenceRef.current) {
            setHasResolvedInitialLoad(true);
          }

          if (pendingRequestsRef.current === 0) {
            setIsLoading(false);
          }
        }
      },
      [imageId, t],
    );

    const handleThreadChanged = useCallback(() => {
      loadComments(0, true);
    }, [loadComments]);

    // ---- 通知ディープリンク: 対象の親コメントまでスクロールし、返信指定が
    // あればスレッドへ引き継ぐ(PC: ReplyThread 自動展開 / モバイル: 返信パネル)。
    // 対象が現在ページに無ければ上限まで追加読み込みして探す。 ----
    const deepLinkPagesLoadedRef = useRef(0);
    const deepLinkHandledRef = useRef(false);
    // 「この返信まで移動」指示。route で経路を排他にする
    // (ReplyThread はモバイルでも CSS 非表示のままマウントされるため、
    // 両経路へ同時に渡すと二重処理になる)。
    const [deepLinkReplyTarget, setDeepLinkReplyTarget] = useState<{
      parentId: string;
      replyId: string;
      route: "thread" | "panel";
    } | null>(null);
    // 対象コメントの一時ハイライト。
    const [highlightedCommentId, setHighlightedCommentId] = useState<
      string | null
    >(null);

    useEffect(() => {
      if (
        !deepLink ||
        deepLinkHandledRef.current ||
        isLoading ||
        !hasResolvedInitialLoad
      ) {
        return;
      }

      const target = comments.find(
        (comment) => comment.id === deepLink.commentId,
      );

      if (!target) {
        // まだ見つからない: 上限までページを追加読み込みして探す。
        if (hasMore && deepLinkPagesLoadedRef.current < DEEP_LINK_MAX_PAGES) {
          deepLinkPagesLoadedRef.current += 1;
          void loadComments(offset, false);
          return;
        }
        // 見つからない(削除済み等): 断念して通常表示。
        deepLinkHandledRef.current = true;
        onDeepLinkConsumed?.();
        return;
      }

      deepLinkHandledRef.current = true;

      // 親コメントへスクロール。
      const element = document.querySelector(
        `[data-comment-id="${CSS.escape(target.id)}"]`,
      );
      element?.scrollIntoView({ behavior: "smooth", block: "center" });

      if (deepLink.replyId && target.reply_count > 0) {
        // URL の後始末(onDeepLinkConsumed)は返信側の探索が完了(成功/断念)
        // してから行う。探索中にリロードされてもディープリンクを再開できる
        // ようにするため(下の onDeepLinkReplyConsumed で呼ぶ)。
        if (window.innerWidth < REPLY_PANEL_MOBILE_BREAKPOINT) {
          // モバイル: 返信パネルを開く(パネル側が対象返信までスクロール)。
          onReplyPanelOpen?.(target.id);
          setDeepLinkReplyTarget({
            parentId: target.id,
            replyId: deepLink.replyId,
            route: "panel",
          });
        } else {
          // PC: 該当スレッドを自動展開して対象返信まで移動。
          setDeepLinkReplyTarget({
            parentId: target.id,
            replyId: deepLink.replyId,
            route: "thread",
          });
        }
      } else {
        // 親コメント自体が対象(投稿へのコメント通知)のときはハイライトする。
        setHighlightedCommentId(target.id);
        window.setTimeout(() => setHighlightedCommentId(null), 2500);
        onDeepLinkConsumed?.();
      }
    }, [
      comments,
      deepLink,
      hasMore,
      hasResolvedInitialLoad,
      isLoading,
      loadComments,
      offset,
      onDeepLinkConsumed,
      onReplyPanelOpen,
    ]);

    // 返信側(ReplyThread / ReplyPanel)の探索完了時: 指示をクリアし、
    // このタイミングで URL の後始末を行う。
    const handleDeepLinkReplyConsumed = useCallback(() => {
      setDeepLinkReplyTarget(null);
      onDeepLinkConsumed?.();
    }, [onDeepLinkConsumed]);

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
                        deleted_at:
                          nextComment.deleted_at ?? comment.deleted_at,
                        updated_at:
                          nextComment.updated_at ?? comment.updated_at,
                      }
                    : comment,
                ),
              );
              return;
            }

            if (
              payload.eventType === "UPDATE" ||
              payload.eventType === "DELETE"
            ) {
              loadComments(0, true);
            }
          },
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
          },
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

    const activeReplyComment = activeReplyCommentId
      ? (comments.find((comment) => comment.id === activeReplyCommentId) ??
        null)
      : null;

    useEffect(() => {
      if (!activeReplyCommentId || isLoading) {
        return;
      }

      if (!activeReplyComment) {
        onReplyPanelOpenChange?.(false);
      }
    }, [
      activeReplyComment,
      activeReplyCommentId,
      isLoading,
      onReplyPanelOpenChange,
    ]);

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
            onOpenReplyPanel={
              onReplyPanelOpen ? () => onReplyPanelOpen(comment.id) : undefined
            }
            highlighted={highlightedCommentId === comment.id}
            deepLinkReplyId={
              deepLinkReplyTarget?.route === "thread" &&
              deepLinkReplyTarget.parentId === comment.id
                ? deepLinkReplyTarget.replyId
                : null
            }
            onDeepLinkReplyConsumed={
              deepLinkReplyTarget?.route === "thread" &&
              deepLinkReplyTarget.parentId === comment.id
                ? handleDeepLinkReplyConsumed
                : undefined
            }
          />
        ))}

        {/* 無限スクロール用のトリガー要素 */}
        {hasMore && (
          <div ref={inViewRef}>{isLoading && <CommentLoadMoreSkeleton />}</div>
        )}

        {/* 全て読み込み完了時のメッセージ */}
        {!hasMore && comments.length > 0 && (
          <div className="py-4 text-center text-sm text-gray-500">
            {t("allCommentsShown")}
          </div>
        )}

        {activeReplyComment && replyPanelStyle && (
          <ReplyPanel
            open
            onOpenChange={(nextOpen) => onReplyPanelOpenChange?.(nextOpen)}
            parentComment={activeReplyComment}
            currentUserId={currentUserId}
            onThreadChanged={handleThreadChanged}
            panelStyle={replyPanelStyle}
            deepLinkReplyId={
              deepLinkReplyTarget?.route === "panel" &&
              deepLinkReplyTarget.parentId === activeReplyComment.id
                ? deepLinkReplyTarget.replyId
                : null
            }
            onDeepLinkReplyConsumed={
              deepLinkReplyTarget?.route === "panel" &&
              deepLinkReplyTarget.parentId === activeReplyComment.id
                ? handleDeepLinkReplyConsumed
                : undefined
            }
          />
        )}
      </div>
    );
  },
);
