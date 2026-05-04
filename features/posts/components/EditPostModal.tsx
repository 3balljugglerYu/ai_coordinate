"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
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
import { Checkbox } from "@/components/ui/checkbox";
import { updatePostCaption } from "../lib/api";

interface EditPostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageId: string;
  currentCaption?: string | null;
  // 既存投稿の show_before_image 値。未指定なら true（既存仕様 = 表示）として扱う。
  currentShowBeforeImage?: boolean;
  /** 投稿される生成画像 (After) の表示 URL */
  afterImageUrl?: string | null;
  /** 関連する Before 画像 URL（永続パスまたは楽観 fallback） */
  beforeImageUrl?: string | null;
}

const MAX_CAPTION_LENGTH = 200;

export function EditPostModal({
  open,
  onOpenChange,
  imageId,
  currentCaption,
  currentShowBeforeImage,
  afterImageUrl,
  beforeImageUrl,
}: EditPostModalProps) {
  const t = useTranslations("posts");
  const router = useRouter();
  const [caption, setCaption] = useState(currentCaption || "");
  const [showBeforeImage, setShowBeforeImage] = useState(
    currentShowBeforeImage !== false
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCaption(currentCaption || "");
      setShowBeforeImage(currentShowBeforeImage !== false);
      setError(null);
    }
  }, [open, currentCaption, currentShowBeforeImage]);

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
        show_before_image: showBeforeImage,
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

  // チェック ON のときだけ Before も並べて表示する（OFF 時は After 単独）
  const showBeforeInPreview = showBeforeImage && !!beforeImageUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("editModalTitle")}</DialogTitle>
            <DialogDescription>
              {t("editModalDescription", { max: MAX_CAPTION_LENGTH })}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {/* 画像プレビュー（After 左 / Before 右、下端揃え、隙間ゼロ）*/}
            {afterImageUrl && (
              <div className="flex w-full items-end justify-center bg-white">
                <div className="relative max-h-[30vh] max-w-full">
                  <Image
                    src={afterImageUrl}
                    alt={t("afterImageAlt")}
                    width={1200}
                    height={1200}
                    className={`block max-h-[30vh] w-auto h-auto object-contain ${
                      showBeforeInPreview ? "max-w-[60vw]" : "max-w-full"
                    }`}
                    sizes="(max-width: 768px) 60vw, 320px"
                  />
                  <div className="absolute bottom-1 right-1 z-10 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    {t("afterImageLabel")}
                  </div>
                </div>
                {showBeforeInPreview && beforeImageUrl && (
                  <div className="relative max-h-[15vh]">
                    <Image
                      src={beforeImageUrl}
                      alt={t("beforeImageAlt")}
                      width={400}
                      height={400}
                      className="block max-h-[15vh] w-auto h-auto max-w-[30vw] object-contain"
                      sizes="(max-width: 768px) 30vw, 160px"
                    />
                    <div className="absolute bottom-1 right-1 z-10 rounded bg-black/60 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                      {t("beforeImageLabel")}
                    </div>
                  </div>
                )}
              </div>
            )}

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

            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-show-before-image"
                checked={showBeforeImage}
                onCheckedChange={(checked) =>
                  setShowBeforeImage(checked === true)
                }
                disabled={isSubmitting}
              />
              <Label
                htmlFor="edit-show-before-image"
                className="cursor-pointer text-sm font-medium"
              >
                {t("showBeforeImageLabel")}
              </Label>
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
