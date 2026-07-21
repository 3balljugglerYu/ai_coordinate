"use client";

import { useTranslations } from "next-intl";
import type { ReplyComment, ReplyToTarget } from "../types";
import { EditableComment } from "./EditableComment";

interface ReplyItemProps {
  reply: ReplyComment;
  currentUserId?: string | null;
  onReplyUpdated: () => void;
  onReplyDeleted: () => void;
  /**
   * この返信への引用リプライを開始する(引用チップ付きコンポーザーを開く)。
   * 未指定なら「返信する」ボタンを表示しない。
   */
  onQuoteReply?: (target: ReplyToTarget) => void;
}

export function ReplyItem({
  reply,
  currentUserId,
  onReplyUpdated,
  onReplyDeleted,
  onQuoteReply,
}: ReplyItemProps) {
  const t = useTranslations("posts");
  const canQuote = Boolean(onQuoteReply) && !reply.deleted_at;

  return (
    <div>
      <EditableComment
        comment={reply}
        currentUserId={currentUserId}
        onCommentUpdated={onReplyUpdated}
        onCommentDeleted={onReplyDeleted}
      />
      {canQuote && (
        <div className="-mt-3 pb-1 pl-9">
          {/* タッチターゲット44px(min-h-11)を確保しつつ、視覚上は小さなテキストリンクに見せる。 */}
          <button
            type="button"
            onClick={() =>
              onQuoteReply?.({
                commentId: reply.id,
                nickname: reply.user_nickname,
                avatarUrl: reply.user_avatar_url,
              })
            }
            className="flex min-h-11 items-center px-2 text-xs font-medium text-gray-500 transition-colors hover:text-gray-700"
          >
            {t("replyAction")}
          </button>
        </div>
      )}
    </div>
  );
}
