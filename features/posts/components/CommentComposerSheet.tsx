"use client";

import { X } from "lucide-react";
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
import type { ReplyToTarget } from "../types";

interface CommentComposerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  imageId?: string;
  parentCommentId?: string;
  currentUserId?: string | null;
  onCommentAdded: () => void;
  placeholder?: string;
  submitLabel?: string;
  submittingLabel?: string;
  compact?: boolean;
  /** 引用リプライの引用先(CommentInput の引用チップに表示)。 */
  replyTo?: ReplyToTarget | null;
  /** 引用チップの解除ボタン(解除すると通常の親スレッド返信になる)。 */
  onReplyToClear?: () => void;
}

export function CommentComposerSheet({
  open,
  onOpenChange,
  title,
  imageId,
  parentCommentId,
  currentUserId,
  onCommentAdded,
  placeholder,
  submitLabel,
  submittingLabel,
  compact,
  replyTo = null,
  onReplyToClear,
}: CommentComposerSheetProps) {
  const t = useTranslations("posts");

  const handleCommentAdded = () => {
    onCommentAdded();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        aria-describedby={undefined}
        className="comment-composer-sheet-content max-h-[85dvh] overflow-y-auto rounded-t-2xl px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <SheetHeader className="flex-row items-center justify-between gap-3 px-0 text-left">
          <SheetTitle>{title}</SheetTitle>
          <SheetClose asChild>
            <Button type="button" variant="ghost" size="icon-sm">
              <X className="h-5 w-5" />
              <span className="sr-only">{t("commentSheetClose")}</span>
            </Button>
          </SheetClose>
        </SheetHeader>
        <CommentInput
          imageId={imageId}
          parentCommentId={parentCommentId}
          currentUserId={currentUserId}
          onCommentAdded={handleCommentAdded}
          onCancel={handleCancel}
          placeholder={placeholder}
          submitLabel={submitLabel}
          submittingLabel={submittingLabel}
          compact={compact}
          autoFocus
          replyTo={replyTo}
          onReplyToClear={onReplyToClear}
        />
      </SheetContent>
    </Sheet>
  );
}
