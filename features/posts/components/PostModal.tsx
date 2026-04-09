"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useUnreadNotificationCount } from "@/features/notifications/components/UnreadNotificationProvider";
import { postImageAPI } from "../lib/api";
import { persistPendingHomePostRefresh } from "../lib/home-post-refresh";

interface PostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageId: string;
  currentCaption?: string | null;
}

const MAX_CAPTION_LENGTH = 200;

export function PostModal({
  open,
  onOpenChange,
  imageId,
  currentCaption,
}: PostModalProps) {
  const t = useTranslations("posts");
  const { refreshUnreadCount } = useUnreadNotificationCount();
  const [caption, setCaption] = useState(currentCaption || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (caption.length > MAX_CAPTION_LENGTH) {
      setError(t("captionTooLong", { max: MAX_CAPTION_LENGTH }));
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await postImageAPI({
        id: imageId,
        caption: caption.trim() || undefined,
      }, {
        postFailed: t("postFailed"),
      });

      persistPendingHomePostRefresh({
        action: "posted",
        postId: response.id,
        bonusGranted: response.bonus_granted,
        bonusMultiplier: response.bonus_multiplier,
        subscriptionPlan: response.subscription_plan,
      });

      // デイリー投稿特典が付与された場合、通知バッジだけは即時更新する
      if (response.bonus_granted && response.bonus_granted > 0) {
        await refreshUnreadCount().catch((error) => {
          console.error("Failed to refresh unread notification count:", error);
        });
      }

      // 投稿完了後、キャッシュ無効化してからホームに遷移
      // ホーム側で一度だけ fresh fetch して新着一覧を同期する
      onOpenChange(false);
      try {
        await fetch("/api/revalidate/home", { method: "POST" });
      } catch {
        // 無効化失敗時も遷移は実行
      }
      window.location.href = "/";
    } catch (err) {
      // TODO: エラー監視が必要な場合は、Sentryなどの専用サービスを利用することを検討してください
      console.error("Post error:", err);
      setError(
        err instanceof Error
          ? err.message
          : t("postFailedRetry")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const remainingChars = MAX_CAPTION_LENGTH - caption.length;
  const isOverLimit = caption.length > MAX_CAPTION_LENGTH;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("postModalTitle")}</DialogTitle>
            <DialogDescription>
              {t("postModalDescription", { max: MAX_CAPTION_LENGTH })}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="space-y-2">
              <Label htmlFor="caption">{t("captionLabel")}</Label>
              <Textarea
                id="caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder={t("captionPlaceholder")}
                rows={4}
                maxLength={MAX_CAPTION_LENGTH}
                className={isOverLimit ? "border-destructive" : ""}
                disabled={isSubmitting}
              />
              <div className="flex justify-between text-sm">
                <span
                  className={isOverLimit ? "text-destructive" : "text-muted-foreground"}
                >
                  {t("charactersRemaining", { count: remainingChars })}
                </span>
                {error && (
                  <span className="text-destructive text-right">{error}</span>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting || isOverLimit}>
              {isSubmitting ? t("postSubmitting") : t("postSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
