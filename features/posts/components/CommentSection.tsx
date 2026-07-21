"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { REPLY_PANEL_MOBILE_BREAKPOINT } from "../lib/constants";
import { CommentInput } from "./CommentInput";
import { CommentComposerTrigger } from "./CommentComposerTrigger";
import { CommentList, type CommentListRef } from "./CommentList";
import type { CommentDeepLink } from "./CommentList";

interface CommentSectionProps {
  postId: string;
  currentUserId?: string | null;
}

/**
 * コメントセクションコンポーネント（動的コンテンツ）
 * 認証状態に依存し、リアルタイムで更新される可能性があるコンテンツ
 */
export function CommentSection({ postId, currentUserId }: CommentSectionProps) {
  const t = useTranslations("posts");
  const searchParams = useSearchParams();
  const commentListRef = useRef<CommentListRef>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  // 通知タップ由来のディープリンク(?comment=<親ID>&reply=<返信ID>)。
  // 処理完了後に URL から取り除く(リロードや戻る操作で再度スクロール
  // しないように)。取り込みはマウント時の一度きりではなく searchParams の
  // 変化に反応させる: 通知一覧から同じ投稿へ再遷移したとき、Next.js は
  // このコンポーネントを再マウントせず state を保持したまま searchParams
  // だけ更新するため、初期化子方式では2回目以降のディープリンクを取りこぼす。
  const [deepLink, setDeepLink] = useState<CommentDeepLink | null>(null);

  useEffect(() => {
    const commentId = searchParams.get("comment");
    if (!commentId) {
      return;
    }
    const replyId = searchParams.get("reply");
    // URL(外部システム)との同期のための意図的な setState。同値なら更新しない。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDeepLink((prev) =>
      prev && prev.commentId === commentId && prev.replyId === replyId
        ? prev
        : { commentId, replyId },
    );
  }, [searchParams]);

  const handleDeepLinkConsumed = useCallback(() => {
    setDeepLink(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("comment");
      url.searchParams.delete("reply");
      window.history.replaceState(window.history.state, "", url.toString());
    }
  }, []);
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
        <div className="hidden md:block">
          <CommentInput
            imageId={postId}
            onCommentAdded={() => {
              // コメントが追加されたら、CommentListをリフレッシュ
              commentListRef.current?.refresh();
            }}
            currentUserId={currentUserId}
          />
        </div>
        <div className="md:hidden">
          <CommentComposerTrigger
            imageId={postId}
            currentUserId={currentUserId}
            onCommentAdded={() => {
              commentListRef.current?.refresh();
            }}
            placeholder={t("commentPlaceholder")}
            triggerLabel={t("commentPlaceholder")}
            sheetTitle={t("commentSheetTitle")}
          />
        </div>
      </div>
      <CommentList
        ref={commentListRef}
        imageId={postId}
        currentUserId={currentUserId}
        activeReplyCommentId={activeReplyCommentId}
        replyPanelStyle={replyPanelStyle}
        onReplyPanelOpen={handleOpenReplyPanel}
        onReplyPanelOpenChange={handleReplyPanelOpenChange}
        deepLink={deepLink}
        onDeepLinkConsumed={handleDeepLinkConsumed}
      />
    </div>
  );
}
