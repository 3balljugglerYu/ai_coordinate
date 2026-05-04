"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useUnreadNotificationCount } from "@/features/notifications/components/UnreadNotificationProvider";
import { fetchBeforeSourceUrl, postImageAPI } from "../lib/api";
import {
  notifyPendingHomePostRefresh,
  persistPendingHomePostRefresh,
} from "../lib/home-post-refresh";
import type { PostImageResponse } from "../types";

interface PostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageId: string;
  currentCaption?: string | null;
  /** 投稿される生成画像 (After) の表示 URL */
  afterImageUrl?: string | null;
  /** 関連する Before 画像 URL（永続パスまたは楽観 fallback） */
  beforeImageUrl?: string | null;
  onPostSuccess?: (
    response: PostImageResponse
  ) =>
    | void
    | { skipDefaultRedirect?: boolean }
    | Promise<void | { skipDefaultRedirect?: boolean }>;
}

const MAX_CAPTION_LENGTH = 200;

export function PostModal({
  open,
  onOpenChange,
  imageId,
  currentCaption,
  afterImageUrl,
  beforeImageUrl,
  onPostSuccess,
}: PostModalProps) {
  const t = useTranslations("posts");
  const { refreshUnreadCount } = useUnreadNotificationCount();
  const [caption, setCaption] = useState(currentCaption || "");
  const [showBeforeImage, setShowBeforeImage] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 呼び出し元から beforeImageUrl が渡されていない場合に自動取得した URL
  const [autoFetchedBeforeUrl, setAutoFetchedBeforeUrl] = useState<
    string | null
  >(null);

  // モーダル open 時、beforeImageUrl が未指定なら imageId から自動 fetch
  useEffect(() => {
    if (!open) {
      setAutoFetchedBeforeUrl(null);
      return;
    }
    if (beforeImageUrl) {
      // 呼び出し元が既に提供している場合は fetch 不要
      return;
    }
    if (!imageId) {
      return;
    }
    let cancelled = false;
    fetchBeforeSourceUrl(imageId).then((url) => {
      if (!cancelled) {
        setAutoFetchedBeforeUrl(url);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, imageId, beforeImageUrl]);

  // 表示優先: 親から渡された URL > 自動取得 URL
  const effectiveBeforeImageUrl = beforeImageUrl ?? autoFetchedBeforeUrl;

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
        show_before_image: showBeforeImage,
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
      notifyPendingHomePostRefresh();

      const postSuccessResult = await onPostSuccess?.(response);
      if (postSuccessResult?.skipDefaultRedirect) {
        return;
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

  // チェック ON のときだけ Before も並べて表示する（OFF 時は After 単独）
  const showBeforeInPreview = showBeforeImage && !!effectiveBeforeImageUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("postModalTitle")}</DialogTitle>
            <DialogDescription>
              {t("postModalDescription", { max: MAX_CAPTION_LENGTH })}
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
                {showBeforeInPreview && effectiveBeforeImageUrl && (
                  <div className="relative max-h-[15vh]">
                    <Image
                      src={effectiveBeforeImageUrl}
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
                id="show-before-image"
                checked={showBeforeImage}
                onCheckedChange={(checked) =>
                  setShowBeforeImage(checked === true)
                }
                disabled={isSubmitting}
              />
              <Label
                htmlFor="show-before-image"
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
              {isSubmitting ? t("postSubmitting") : t("postSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
