"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ParentComment } from "../types";
import { EditableComment } from "./EditableComment";
import { ReplyThread } from "./ReplyThread";

const ReplyPanel = dynamic(
  () => import("./ReplyPanel").then((mod) => mod.ReplyPanel),
  {
    ssr: false,
  }
);

interface CommentItemProps {
  comment: ParentComment;
  currentUserId?: string | null;
  onCommentUpdated: () => void;
  onCommentDeleted: () => void;
  onThreadChanged: () => void;
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
}: CommentItemProps) {
  const t = useTranslations("posts");
  const [isReplyPanelOpen, setIsReplyPanelOpen] = useState(false);
  const [hasLoadedReplyPanel, setHasLoadedReplyPanel] = useState(false);
  const hasReplyEntryPoint = comment.reply_count > 0 || !comment.deleted_at;

  const handleOpenReplyPanel = () => {
    setHasLoadedReplyPanel(true);
    setIsReplyPanelOpen(true);
  };

  return (
    <div>
      <EditableComment
        comment={comment}
        currentUserId={currentUserId}
        onCommentUpdated={onCommentUpdated}
        onCommentDeleted={onCommentDeleted}
      />
      {hasReplyEntryPoint && (
        <div className="pb-3 pl-11 md:hidden">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-gray-600"
            onClick={handleOpenReplyPanel}
          >
            <span>
              {comment.reply_count > 0
                ? t("repliesCount", { count: comment.reply_count })
                : t("replyAction")}
            </span>
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
      {hasLoadedReplyPanel && (
        <ReplyPanel
          open={isReplyPanelOpen}
          onOpenChange={setIsReplyPanelOpen}
          parentComment={comment}
          currentUserId={currentUserId}
          onThreadChanged={onThreadChanged}
        />
      )}
    </div>
  );
}
