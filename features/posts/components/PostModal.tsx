"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { useToast } from "@/components/ui/use-toast";
import { useUnreadNotificationCount } from "@/features/notifications/components/UnreadNotificationProvider";
import { postImageAPI } from "../lib/api";

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
  const router = useRouter();
  const { toast } = useToast();
  const { refreshUnreadCount } = useUnreadNotificationCount();
  const [caption, setCaption] = useState(currentCaption || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (caption.length > MAX_CAPTION_LENGTH) {
      setError(`キャプションは${MAX_CAPTION_LENGTH}文字以内で入力してください`);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await postImageAPI({
        id: imageId,
        caption: caption.trim() || undefined,
      });

      // デイリー投稿特典が付与された場合、Toast通知を表示
      if (response.bonus_granted && response.bonus_granted > 0) {
        toast({
          title: "特典獲得！",
          description: `今日の投稿で${response.bonus_granted}ペルコインを獲得しました！`,
          variant: "default",
        });
        await refreshUnreadCount().catch((error) => {
          console.error("Failed to refresh unread notification count:", error);
        });
      }

      // 投稿完了後、投稿一覧画面に遷移
      onOpenChange(false);
      router.push("/");
      router.refresh();
    } catch (err) {
      // TODO: エラー監視が必要な場合は、Sentryなどの専用サービスを利用することを検討してください
      console.error("Post error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "投稿に失敗しました。もう一度お試しください。"
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
            <DialogTitle>画像を投稿</DialogTitle>
            <DialogDescription>
              キャプションを入力して投稿します（任意、最大{MAX_CAPTION_LENGTH}
              文字）
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="space-y-2">
              <Label htmlFor="caption">キャプション</Label>
              <Textarea
                id="caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="画像の説明を入力してください（任意）"
                rows={4}
                maxLength={MAX_CAPTION_LENGTH}
                className={isOverLimit ? "border-destructive" : ""}
                disabled={isSubmitting}
              />
              <div className="flex justify-between text-sm">
                <span
                  className={isOverLimit ? "text-destructive" : "text-muted-foreground"}
                >
                  {remainingChars}文字残り
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
              キャンセル
            </Button>
            <Button type="submit" disabled={isSubmitting || isOverLimit}>
              {isSubmitting ? "投稿中..." : "投稿する"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
