"use client";

import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ParentComment } from "../types";
import { EditableComment } from "./EditableComment";
import { ReplyThread } from "./ReplyThread";

interface CommentItemProps {
  comment: ParentComment;
  currentUserId?: string | null;
  onCommentUpdated: () => void;
  onCommentDeleted: () => void;
  onThreadChanged: () => void;
  onOpenReplyPanel?: () => void;
}

/**
 * コメントアイテムコンポーネント
 * インライン編集と削除機能を実装
 */
export function CommentItem({
  comment,
  currentUserId,
  onCommentUpdated,
  onCommentDeleted,
  onThreadChanged,
  onOpenReplyPanel,
}: CommentItemProps) {
  const t = useTranslations("posts");
  const hasReplies = comment.reply_count > 0;

  return (
    <div>
      <EditableComment
        comment={comment}
        currentUserId={currentUserId}
        onCommentUpdated={onCommentUpdated}
        onCommentDeleted={onCommentDeleted}
        onCommentSelected={!comment.deleted_at ? onOpenReplyPanel : undefined}
      />
      {hasReplies && (
        <div className="pb-3 pl-11 md:hidden">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-gray-600"
            onClick={onOpenReplyPanel}
          >
            <span>{t("repliesCount", { count: comment.reply_count })}</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
      <div className="hidden md:block">
        <ReplyThread
          parentComment={comment}
          currentUserId={currentUserId}
          onThreadChanged={onThreadChanged}
        />
      </div>
    </div>
  );
}
