"use client";

import { useState, useEffect } from "react";
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
import { updatePostCaption } from "../lib/api";

interface EditPostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageId: string;
  currentCaption?: string | null;
}

const MAX_CAPTION_LENGTH = 200;

export function EditPostModal({
  open,
  onOpenChange,
  imageId,
  currentCaption,
}: EditPostModalProps) {
  const router = useRouter();
  const [caption, setCaption] = useState(currentCaption || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCaption(currentCaption || "");
      setError(null);
    }
  }, [open, currentCaption]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (caption.length > MAX_CAPTION_LENGTH) {
      setError(`キャプションは${MAX_CAPTION_LENGTH}文字以内で入力してください`);
      return;
    }

    setIsSubmitting(true);

    try {
      await updatePostCaption({
        id: imageId,
        caption: caption.trim() || undefined,
      });

      onOpenChange(false);
      router.refresh();
    } catch (err) {
      console.error("Update error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "更新に失敗しました。もう一度お試しください。"
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
            <DialogTitle>キャプションを編集</DialogTitle>
            <DialogDescription>
              キャプションを編集します（最大{MAX_CAPTION_LENGTH}文字）
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
              {isSubmitting ? "更新中..." : "更新する"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

