"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { REPLY_PANEL_MOBILE_BREAKPOINT } from "../lib/constants";
import { CommentInput } from "./CommentInput";
import { CommentList, type CommentListRef } from "./CommentList";

interface CommentSectionProps {
  postId: string;
  currentUserId?: string | null;
}

/**
 * コメントセクションコンポーネント（動的コンテンツ）
 * 認証状態に依存し、リアルタイムで更新される可能性があるコンテンツ
 */
export function CommentSection({ postId, currentUserId }: CommentSectionProps) {
  const commentListRef = useRef<CommentListRef>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const [activeReplyCommentId, setActiveReplyCommentId] = useState<
    string | null
  >(null);
  const [replyPanelStyle, setReplyPanelStyle] = useState<CSSProperties | null>(
    null,
  );

  const measureReplyPanelStyle = useCallback((): CSSProperties | null => {
    const section = sectionRef.current;

    if (!section || window.innerWidth >= REPLY_PANEL_MOBILE_BREAKPOINT) {
      return null;
    }

    const rect = section.getBoundingClientRect();
    const visualViewport = window.visualViewport;
    const viewportHeight = visualViewport?.height ?? window.innerHeight;
    const top = Math.max(rect.top, 0);
    const height = Math.max(viewportHeight - top, 0);

    if (rect.width <= 0 || height <= 0) {
      return null;
    }

    return {
      top,
      left: rect.left,
      width: rect.width,
      height,
    };
  }, []);

  const updateReplyPanelStyle = useCallback(() => {
    setReplyPanelStyle(measureReplyPanelStyle());
  }, [measureReplyPanelStyle]);

  const handleOpenReplyPanel = useCallback(
    (commentId: string) => {
      setActiveReplyCommentId(commentId);
      setReplyPanelStyle(measureReplyPanelStyle());
    },
    [measureReplyPanelStyle],
  );

  const handleReplyPanelOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setActiveReplyCommentId(null);
      setReplyPanelStyle(null);
    }
  }, []);

  useEffect(() => {
    if (!activeReplyCommentId) {
      setReplyPanelStyle(null);
      return;
    }

    updateReplyPanelStyle();
    const section = sectionRef.current;

    const handleViewportChange = () => {
      updateReplyPanelStyle();
    };

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange);

    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener("resize", handleViewportChange);
    visualViewport?.addEventListener("scroll", handleViewportChange);

    const resizeObserver =
      typeof ResizeObserver === "undefined" || !section
        ? null
        : new ResizeObserver(handleViewportChange);

    if (resizeObserver && section) {
      resizeObserver.observe(section);
    }

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange);
      visualViewport?.removeEventListener("resize", handleViewportChange);
      visualViewport?.removeEventListener("scroll", handleViewportChange);
      resizeObserver?.disconnect();
    };
  }, [activeReplyCommentId, updateReplyPanelStyle]);

  return (
    <div
      ref={sectionRef}
      className="container mx-auto max-w-4xl border-t border-gray-200 bg-white px-4 py-3"
    >
      <div className="mb-4">
        <CommentInput
          imageId={postId}
          onCommentAdded={() => {
            // コメントが追加されたら、CommentListをリフレッシュ
            commentListRef.current?.refresh();
          }}
          currentUserId={currentUserId}
        />
      </div>
      <CommentList
        ref={commentListRef}
        imageId={postId}
        currentUserId={currentUserId}
        activeReplyCommentId={activeReplyCommentId}
        replyPanelStyle={replyPanelStyle}
        onReplyPanelOpen={handleOpenReplyPanel}
        onReplyPanelOpenChange={handleReplyPanelOpenChange}
      />
    </div>
  );
}
