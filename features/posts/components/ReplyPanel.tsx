"use client";

import { useTransition } from "react";
import { ChevronLeft, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CommentInput } from "./CommentInput";
import { EditableComment } from "./EditableComment";
import { ReplyItem } from "./ReplyItem";
import type { ParentComment } from "../types";
import { useReplies } from "../hooks/useReplies";

interface ReplyPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentComment: ParentComment;
  currentUserId?: string | null;
  onThreadChanged: () => void;
}

export function ReplyPanel({
  open,
  onOpenChange,
  parentComment,
  currentUserId,
  onThreadChanged,
}: ReplyPanelProps) {
  const t = useTranslations("posts");
  const commonT = useTranslations("common");
  const [, startTransition] = useTransition();
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-none gap-0 p-0"
        showCloseButton={false}
      >
        <div className="flex h-full flex-col bg-gray-50">
          <SheetHeader className="border-b border-gray-200 bg-white px-4 py-3">
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
              <SheetTitle className="text-base">{t("repliesTitle")}</SheetTitle>
              <SheetClose asChild>
                <Button type="button" variant="ghost" size="icon-sm">
                  <X className="h-5 w-5" />
                  <span className="sr-only">{t("cancel")}</span>
                </Button>
              </SheetClose>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            <div className="border-b border-gray-200 bg-white px-4">
              <EditableComment
                comment={parentComment}
                onCommentUpdated={() => undefined}
                onCommentDeleted={() => undefined}
              />
            </div>

            <div className="px-4 py-4">
              {isLoading && replies.length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-500">
                  {t("repliesLoading")}
                </div>
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
            <CommentInput
              parentCommentId={parentComment.id}
              currentUserId={currentUserId}
              onCommentAdded={handleReplyAdded}
              placeholder={t("replyPlaceholder")}
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
        </div>
      </SheetContent>
    </Sheet>
  );
}
