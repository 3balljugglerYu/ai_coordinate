"use client";

import type { ReplyComment } from "../types";
import { EditableComment } from "./EditableComment";

interface ReplyItemProps {
  reply: ReplyComment;
  currentUserId?: string | null;
  onReplyUpdated: () => void;
  onReplyDeleted: () => void;
}

export function ReplyItem({
  reply,
  currentUserId,
  onReplyUpdated,
  onReplyDeleted,
}: ReplyItemProps) {
  return (
    <EditableComment
      comment={reply}
      currentUserId={currentUserId}
      onCommentUpdated={onReplyUpdated}
      onCommentDeleted={onReplyDeleted}
    />
  );
}
