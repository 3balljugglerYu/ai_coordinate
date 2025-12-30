"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createCommentAPI } from "../lib/api";
import { useToast } from "@/components/ui/use-toast";
import { AuthModal } from "@/features/auth/components/AuthModal";

interface CommentInputProps {
  imageId: string;
  onCommentAdded: () => void;
  currentUserId?: string | null;
}

const MAX_LENGTH = 200;

/**
 * コメント入力欄コンポーネント
 */
export function CommentInput({
  imageId,
  onCommentAdded,
  currentUserId,
}: CommentInputProps) {
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { toast } = useToast();

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

    if (!currentUserId) {
      setShowAuthModal(true);
      return;
    }

    const trimmedContent = content.trim();
    if (trimmedContent.length === 0) {
      toast({
        title: "コメントを入力してください",
        description: "空のコメントは投稿できません",
        variant: "destructive",
      });
      return;
    }

    if (trimmedContent.length > MAX_LENGTH) {
      toast({
        title: "文字数制限を超えています",
        description: `コメントは${MAX_LENGTH}文字以内で入力してください`,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await createCommentAPI(imageId, trimmedContent);
      setContent("");
      onCommentAdded();
    } catch (error) {
      toast({
        title: "エラー",
        description:
          error instanceof Error
            ? error.message
            : "コメントの投稿に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const remainingChars = MAX_LENGTH - content.length;
  const isOverLimit = content.length > MAX_LENGTH;

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-2">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="コメントを入力..."
          rows={1}
          className="resize-none !min-h-[2.5rem] py-2"
          disabled={isLoading}
          readOnly={!currentUserId}
          onFocus={(e) => {
            if (!currentUserId) {
              e.currentTarget.blur();
              setShowAuthModal(true);
            }
          }}
          onClick={(e) => {
            if (!currentUserId) {
              e.currentTarget.blur();
              setShowAuthModal(true);
            }
          }}
        />
        <div className="flex items-center justify-between">
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
              ? `${content.length - MAX_LENGTH}文字超過`
              : `${remainingChars}文字`}
          </span>
          <Button
            type="submit"
            size="sm"
            disabled={
              isLoading ||
              content.trim().length === 0 ||
              content.trim().length > MAX_LENGTH
            }
          >
            {isLoading ? "投稿中..." : "投稿"}
          </Button>
        </div>
      </form>
      <AuthModal
        open={showAuthModal && !currentUserId}
        onClose={() => setShowAuthModal(false)}
        redirectTo="/"
      />
    </>
  );
}
