"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createCommentAPI, createReplyAPI } from "../lib/api";
import { useToast } from "@/components/ui/use-toast";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { usePathname } from "next/navigation";
import { sanitizeProfileText, validateProfileText } from "@/lib/utils";
import { COMMENT_MAX_LENGTH } from "@/constants";

interface CommentInputProps {
  imageId?: string;
  parentCommentId?: string;
  onCommentAdded: () => void;
  currentUserId?: string | null;
  placeholder?: string;
  submitLabel?: string;
  submittingLabel?: string;
  compact?: boolean;
  autoFocus?: boolean;
  onCancel?: () => void;
  disabled?: boolean;
  disabledMessage?: string;
}

/**
 * コメント入力欄コンポーネント
 */
export function CommentInput({
  imageId,
  parentCommentId,
  onCommentAdded,
  currentUserId,
  placeholder,
  submitLabel,
  submittingLabel,
  compact = false,
  autoFocus = false,
  onCancel,
  disabled = false,
  disabledMessage,
}: CommentInputProps) {
  const t = useTranslations("posts");
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { toast } = useToast();
  const pathname = usePathname();
  const isReplyComposer = Boolean(parentCommentId);
  const isInputDisabled = isLoading || disabled;

  const handleInteraction = (e: React.FocusEvent<HTMLTextAreaElement> | React.MouseEvent<HTMLTextAreaElement>) => {
    if (disabled) {
      return;
    }

    if (!currentUserId) {
      e.currentTarget.blur();
      setShowAuthModal(true);
    }
  };

  // ブラウザ拡張機能によるエラーを抑制
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      // "message port closed"エラーはブラウザ拡張機能によるものなので無視
      if (
        event.message?.includes("message port closed") ||
        event.message?.includes("The message port closed")
      ) {
        event.preventDefault();
        return false;
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      // "message port closed"エラーはブラウザ拡張機能によるものなので無視
      const reason = event.reason?.toString() || "";
      if (
        reason.includes("message port closed") ||
        reason.includes("The message port closed")
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (disabled) {
      return;
    }

    if (!currentUserId) {
      setShowAuthModal(true);
      return;
    }

    // サニタイズ
    const sanitized = sanitizeProfileText(content);

    // バリデーション（空文字は許可しない）
    const validation = validateProfileText(
      sanitized.value,
      COMMENT_MAX_LENGTH,
      "comment",
      false,
      {
        required: t("commentRequired"),
        invalidCharacters: t("commentInvalidCharacters"),
        maxLength: t("commentTooLong", { max: COMMENT_MAX_LENGTH }),
      }
    );

    if (!validation.valid) {
      toast({
        title: t("errorTitle"),
        description:
          validation.error ||
          (isReplyComposer ? t("replyCreateFailed") : t("commentCreateFailed")),
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      if (isReplyComposer) {
        if (!parentCommentId) {
          throw new Error(t("replyCreateFailed"));
        }
        await createReplyAPI(parentCommentId!, sanitized.value, {
          replyCreateFailed: t("replyCreateFailed"),
        });
      } else {
        if (!imageId) {
          throw new Error(t("commentCreateFailed"));
        }
        await createCommentAPI(imageId!, sanitized.value, {
          commentCreateFailed: t("commentCreateFailed"),
        });
      }
      setContent("");
      onCommentAdded();
      onCancel?.();
    } catch (error) {
      toast({
        title: t("errorTitle"),
        description:
          error instanceof Error
            ? error.message
            : isReplyComposer
            ? t("replyCreateFailed")
            : t("commentCreateFailed"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const remainingChars = COMMENT_MAX_LENGTH - content.length;
  const isOverLimit = content.length > COMMENT_MAX_LENGTH;

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-2">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={
            placeholder ||
            (isReplyComposer ? t("replyPlaceholder") : t("commentPlaceholder"))
          }
          rows={compact ? 2 : 1}
          className={`resize-none py-2 ${compact ? "min-h-[4.5rem]" : "!min-h-[2.5rem]"}`}
          disabled={isInputDisabled}
          readOnly={!currentUserId || disabled}
          onFocus={disabled ? undefined : handleInteraction}
          onClick={disabled ? undefined : handleInteraction}
          autoFocus={autoFocus}
        />
        <div className="flex items-center justify-between">
          {disabled ? (
            <span className="text-xs text-gray-500">{disabledMessage}</span>
          ) : (
            <span
              className={`text-xs ${
                isOverLimit
                  ? "text-red-500"
                  : remainingChars < 20
                  ? "text-orange-500"
                  : "text-gray-500"
              }`}
            >
              {isOverLimit
                ? t("commentOverLimit", {
                    count: content.length - COMMENT_MAX_LENGTH,
                  })
                : t("commentRemaining", { count: remainingChars })}
            </span>
          )}
          <div className="flex items-center gap-2">
            {onCancel && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onCancel}
                disabled={isLoading}
              >
                {t("cancel")}
              </Button>
            )}
            <Button
              type="submit"
              size="sm"
              disabled={
                isInputDisabled ||
                content.trim().length === 0 ||
                content.trim().length > COMMENT_MAX_LENGTH
              }
            >
              {isLoading
                ? submittingLabel ||
                  (isReplyComposer ? t("replySubmitting") : t("commentSubmitting"))
                : submitLabel ||
                  (isReplyComposer ? t("replySubmit") : t("commentSubmit"))}
            </Button>
          </div>
        </div>
      </form>
      <AuthModal
        open={showAuthModal && !currentUserId}
        onClose={() => setShowAuthModal(false)}
        redirectTo={pathname}
      />
    </>
  );
}
