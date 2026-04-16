"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CommentInput } from "./CommentInput";
import { ReplyItem } from "./ReplyItem";
import type { ParentComment } from "../types";
import { useReplies } from "../hooks/useReplies";

interface ReplyThreadProps {
  parentComment: ParentComment;
  currentUserId?: string | null;
  onThreadChanged: () => void;
}

export function ReplyThread({
  parentComment,
  currentUserId,
  onThreadChanged,
}: ReplyThreadProps) {
  const t = useTranslations("posts");
  const [, startTransition] = useTransition();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isReplyComposerOpen, setIsReplyComposerOpen] = useState(false);
  const {
    replies,
    isLoading,
    hasMore,
    offset,
    loadReplies,
    refreshReplies,
  } = useReplies({
    parentCommentId: parentComment.id,
    parentReplyCount: parentComment.reply_count,
    currentUserId,
    enabled: isExpanded,
    onReplyCountChanged: () => {
      startTransition(() => {
        onThreadChanged();
      });
    },
  });

  const refreshParentThread = () => {
    startTransition(() => {
      onThreadChanged();
    });
  };

  const handleToggleReplies = async () => {
    setIsExpanded((prev) => !prev);
  };

  const handleReplyAdded = async () => {
    setIsReplyComposerOpen(false);
    setIsExpanded(true);
    await refreshReplies();
    refreshParentThread();
  };

  const handleReplyUpdated = async () => {
    await refreshReplies();
  };

  const handleReplyDeleted = async () => {
    await refreshReplies();
    refreshParentThread();
  };

  const hasReplies = parentComment.reply_count > 0;

  if (!hasReplies && parentComment.deleted_at && !isReplyComposerOpen) {
    return null;
  }

  return (
    <div className="pb-3 pl-11">
      <div className="flex flex-wrap items-center gap-2">
        {!parentComment.deleted_at && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-gray-600"
            onClick={() => setIsReplyComposerOpen((prev) => !prev)}
          >
            {isReplyComposerOpen ? t("cancelReply") : t("replyAction")}
          </Button>
        )}
        {hasReplies && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-gray-600"
            onClick={handleToggleReplies}
            disabled={isLoading && !isExpanded}
          >
            {isExpanded
              ? t("hideReplies")
              : t("showReplies", { count: parentComment.reply_count })}
          </Button>
        )}
      </div>

      {isReplyComposerOpen && (
        <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
          <CommentInput
            parentCommentId={parentComment.id}
            currentUserId={currentUserId}
            onCommentAdded={handleReplyAdded}
            placeholder={t("replyPlaceholder")}
            submitLabel={t("replySubmit")}
            submittingLabel={t("replySubmitting")}
            compact
            autoFocus
            onCancel={() => setIsReplyComposerOpen(false)}
          />
        </div>
      )}

      {isExpanded && (
        <div className="mt-3 border-l border-gray-200 pl-4">
          {isLoading && replies.length === 0 ? (
            <div className="py-3 text-sm text-gray-500">
              {t("repliesLoading")}
            </div>
          ) : (
            replies.map((reply) => (
              <ReplyItem
                key={reply.id}
                reply={reply}
                currentUserId={currentUserId}
                onReplyUpdated={handleReplyUpdated}
                onReplyDeleted={handleReplyDeleted}
              />
            ))
          )}

          {hasMore && (
            <div className="pb-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-gray-600"
                onClick={() => loadReplies(offset, false)}
                disabled={isLoading}
              >
                {isLoading ? t("repliesLoading") : t("loadMoreReplies")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
