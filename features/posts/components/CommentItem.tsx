"use client";

import { MessageCircle } from "lucide-react";
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
  const showMobileReplyButton = !comment.deleted_at || hasReplies;

  return (
    <div>
      <EditableComment
        comment={comment}
        currentUserId={currentUserId}
        onCommentUpdated={onCommentUpdated}
        onCommentDeleted={onCommentDeleted}
        onCommentSelected={!comment.deleted_at ? onOpenReplyPanel : undefined}
      />
      {showMobileReplyButton && (
        <div className="pb-3 pl-11 md:hidden">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs text-gray-600"
            onClick={onOpenReplyPanel}
          >
            <MessageCircle className="h-4 w-4" />
            <span>{t("replyAction")}</span>
            {hasReplies && (
              <span className="font-medium">{comment.reply_count}</span>
            )}
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
