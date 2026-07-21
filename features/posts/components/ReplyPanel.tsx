"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { CSSProperties } from "react";
import { useState, useTransition } from "react";
import { ChevronLeft, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CommentComposerSheet } from "./CommentComposerSheet";
import { CommentComposerTrigger } from "./CommentComposerTrigger";
import { EditableComment } from "./EditableComment";
import { ReplyItem } from "./ReplyItem";
import { ReplyPanelSkeleton } from "./ReplyPanelSkeleton";
import type { ParentComment, ReplyToTarget } from "../types";
import { useReplies } from "../hooks/useReplies";

interface ReplyPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentComment: ParentComment;
  currentUserId?: string | null;
  onThreadChanged: () => void;
  panelStyle: CSSProperties;
}

export function ReplyPanel({
  open,
  onOpenChange,
  parentComment,
  currentUserId,
  onThreadChanged,
  panelStyle,
}: ReplyPanelProps) {
  const t = useTranslations("posts");
  const commonT = useTranslations("common");
  const [, startTransition] = useTransition();
  // 引用リプライ用コンポーザーの開閉と引用先。
  // 引用チップの解除ではシートを開いたまま通常の親スレッド返信に切り替え、
  // シートを閉じる(キャンセル)・送信成功では両方クリアする。
  const [isQuoteSheetOpen, setIsQuoteSheetOpen] = useState(false);
  const [quoteReplyTo, setQuoteReplyTo] = useState<ReplyToTarget | null>(null);

  const handleQuoteReply = (target: ReplyToTarget) => {
    setQuoteReplyTo(target);
    setIsQuoteSheetOpen(true);
  };

  const closeQuoteSheet = () => {
    setIsQuoteSheetOpen(false);
    setQuoteReplyTo(null);
  };
  const {
    replies,
    isLoading,
    hasMore,
    offset,
    hasResolvedInitialLoad,
    loadReplies,
    refreshReplies,
  } = useReplies({
    parentCommentId: parentComment.id,
    parentReplyCount: parentComment.reply_count,
    currentUserId,
    enabled: open,
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

  const handleReplyAdded = async () => {
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

  const hasReplies = parentComment.reply_count > 0 || replies.length > 0;
  const showRepliesSkeleton =
    parentComment.reply_count > 0 && !hasResolvedInitialLoad;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal forceMount>
        <DialogPrimitive.Overlay
          className="reply-panel-mobile-overlay fixed z-40 bg-black/5 md:hidden"
          style={panelStyle}
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="reply-panel-mobile-content fixed z-50 flex flex-col overflow-hidden border border-gray-200 bg-gray-50 shadow-xl outline-none md:hidden"
          style={panelStyle}
        >
          <div className="flex h-full flex-col bg-gray-50">
            <div className="border-b border-gray-200 bg-white px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onOpenChange(false)}
                >
                  <ChevronLeft className="h-5 w-5" />
                  <span className="sr-only">{commonT("back")}</span>
                </Button>
                <DialogPrimitive.Title className="text-base font-semibold">
                  {t("repliesTitle")}
                </DialogPrimitive.Title>
                <DialogPrimitive.Close asChild>
                  <Button type="button" variant="ghost" size="icon-sm">
                    <X className="h-5 w-5" />
                    <span className="sr-only">{t("cancel")}</span>
                  </Button>
                </DialogPrimitive.Close>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="border-b border-gray-200 bg-white px-4">
                <EditableComment
                  comment={parentComment}
                  onCommentUpdated={() => undefined}
                  onCommentDeleted={() => undefined}
                />
              </div>

              <div className="px-4 py-4">
                {showRepliesSkeleton ? (
                  <ReplyPanelSkeleton />
                ) : replies.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
                    {t("noReplies")}
                  </div>
                ) : (
                  <div className="rounded-xl border border-gray-200 bg-white px-3">
                    {replies.map((reply) => (
                      <ReplyItem
                        key={reply.id}
                        reply={reply}
                        currentUserId={currentUserId}
                        onReplyUpdated={handleReplyUpdated}
                        onReplyDeleted={handleReplyDeleted}
                        onQuoteReply={
                          parentComment.deleted_at
                            ? undefined
                            : handleQuoteReply
                        }
                      />
                    ))}
                  </div>
                )}

                {hasReplies && hasMore && (
                  <div className="pt-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 w-full text-sm text-gray-600"
                      onClick={() => loadReplies(offset, false)}
                      disabled={isLoading}
                    >
                      {isLoading ? t("repliesLoading") : t("loadMoreReplies")}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="safe-area-inset-bottom border-t border-gray-200 bg-white p-4">
              <CommentComposerTrigger
                parentCommentId={parentComment.id}
                currentUserId={currentUserId}
                onCommentAdded={handleReplyAdded}
                placeholder={t("replyPlaceholder")}
                triggerLabel={t("replyPlaceholder")}
                sheetTitle={t("replySheetTitle")}
                submitLabel={t("replySubmit")}
                submittingLabel={t("replySubmitting")}
                compact
                disabled={Boolean(parentComment.deleted_at)}
                disabledMessage={
                  parentComment.deleted_at
                    ? t("cannotReplyToDeletedComment")
                    : undefined
                }
              />
            </div>

            {/* 引用リプライ用コンポーザー。返信の「返信する」から開く。
                引用チップの解除はシートを開いたまま通常返信に切り替え、
                閉じる(キャンセル)・送信成功では引用状態ごとクリアする。 */}
            <CommentComposerSheet
              open={isQuoteSheetOpen}
              onOpenChange={(nextOpen) => {
                if (!nextOpen) {
                  closeQuoteSheet();
                }
              }}
              title={t("replySheetTitle")}
              parentCommentId={parentComment.id}
              currentUserId={currentUserId}
              onCommentAdded={() => {
                closeQuoteSheet();
                void handleReplyAdded();
              }}
              placeholder={t("replyPlaceholder")}
              submitLabel={t("replySubmit")}
              submittingLabel={t("replySubmitting")}
              compact
              replyTo={quoteReplyTo}
              onReplyToClear={() => setQuoteReplyTo(null)}
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
