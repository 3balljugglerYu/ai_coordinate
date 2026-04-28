"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { CommentComposerSheet } from "./CommentComposerSheet";

interface CommentComposerTriggerProps {
  imageId?: string;
  parentCommentId?: string;
  currentUserId?: string | null;
  onCommentAdded: () => void;
  placeholder: string;
  triggerLabel: string;
  sheetTitle: string;
  submitLabel?: string;
  submittingLabel?: string;
  compact?: boolean;
  disabled?: boolean;
  disabledMessage?: string;
}

export function CommentComposerTrigger({
  imageId,
  parentCommentId,
  currentUserId,
  onCommentAdded,
  placeholder,
  triggerLabel,
  sheetTitle,
  submitLabel,
  submittingLabel,
  compact,
  disabled = false,
  disabledMessage,
}: CommentComposerTriggerProps) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const handleClick = () => {
    if (!currentUserId) {
      setAuthModalOpen(true);
      return;
    }
    setSheetOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        aria-label={triggerLabel}
        className="flex min-h-[44px] w-full items-center rounded-md border border-input bg-background px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {triggerLabel}
      </button>
      {disabled && disabledMessage ? (
        <p className="mt-2 text-xs text-gray-500">{disabledMessage}</p>
      ) : null}
      <CommentComposerSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={sheetTitle}
        imageId={imageId}
        parentCommentId={parentCommentId}
        currentUserId={currentUserId}
        onCommentAdded={onCommentAdded}
        placeholder={placeholder}
        submitLabel={submitLabel}
        submittingLabel={submittingLabel}
        compact={compact}
      />
      <AuthModal
        open={authModalOpen && !currentUserId}
        onClose={() => setAuthModalOpen(false)}
        redirectTo={pathname}
      />
    </>
  );
}
