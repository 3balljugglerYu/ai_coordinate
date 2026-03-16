"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("posts");
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
      setError(t("captionTooLong", { max: MAX_CAPTION_LENGTH }));
      return;
    }

    setIsSubmitting(true);

    try {
      await updatePostCaption({
        id: imageId,
        caption: caption.trim() || undefined,
      }, {
        updateFailed: t("updateFailed"),
      });

      onOpenChange(false);
      router.refresh();
    } catch (err) {
      console.error("Update error:", err);
      setError(
        err instanceof Error
          ? err.message
          : t("updateFailedRetry")
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
            <DialogTitle>{t("editModalTitle")}</DialogTitle>
            <DialogDescription>
              {t("editModalDescription", { max: MAX_CAPTION_LENGTH })}
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
              {isSubmitting ? t("updateSubmitting") : t("updateSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
