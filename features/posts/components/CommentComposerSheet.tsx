"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CommentInput } from "./CommentInput";

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
}: CommentComposerSheetProps) {
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
        <SheetHeader className="px-0">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        {open ? (
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
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
