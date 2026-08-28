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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { HashtagHighlightTextarea } from "./HashtagHighlightTextarea";
import { HashtagSuggestionChips } from "./HashtagSuggestionChips";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { GenerationType } from "@/features/generation/types";
import {
  PromptVisibilityField,
  type PromptVisibilityValue,
} from "./PromptVisibilityField";
import { useUnreadNotificationCount } from "@/features/notifications/components/UnreadNotificationProvider";
import { fetchBeforeSourceUrl, postImageAPI } from "../lib/api";
import { isSuspendedPublishError } from "../lib/post-error-codes";
import {
  beforeImageUrlCache,
  cacheBeforeImageUrl,
} from "../lib/before-image-cache";
import {
  abortPostProgress,
  finishPostProgress,
  startPostProgress,
} from "../lib/post-progress-store";
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
  /**
   * 生成種別。プロンプト非公開トグルは `free` の root 投稿だけに出す。
   * 未指定ならトグルを出さない（= 既定の公開のまま）。coordinate や
   * one_tap_style で private を送ると DB trigger が拒否するため、
   * 「出さない」を安全側の既定にしている。
   */
  generationType?: GenerationType | null;
  /**
   * 派生投稿の原作 ID。値があるとトグルを出さない。
   * 派生投稿は trigger が常に非公開へ強制するので選択肢にならない。
   */
  sourcePostId?: string | null;
  /**
   * 投稿が成立したあとに呼ぶ。画面ごとの後始末(一覧の差し替えなど)用。
   *
   * 戻り値は見ない。以前は `{ skipDefaultRedirect: true }` で既定の
   * ホーム遷移を止められたが、**投稿では画面を移動しなくなった**ので、
   * 抑止するものが無くなった。
   */
  onPostSuccess?: (response: PostImageResponse) => void | Promise<void>;
}

const MAX_CAPTION_LENGTH = 200;

export function PostModal({
  open,
  onOpenChange,
  imageId,
  currentCaption,
  afterImageUrl,
  beforeImageUrl,
  generationType,
  sourcePostId,
  onPostSuccess,
}: PostModalProps) {
  const t = useTranslations("posts");
  const { refreshUnreadCount } = useUnreadNotificationCount();
  const [caption, setCaption] = useState(currentCaption || "");
  const [showBeforeImage, setShowBeforeImage] = useState(true);
  /*
    既定は非公開（ADR-004 改訂）。

    非公開なら、使うたびに投稿者のところへ人が戻ってくる。公開だと
    コピーされた分はその輪から外れる。既定は最も強い誘導なので、
    投稿者に返るほうへ倒す。
  */
  const [promptVisibility, setPromptVisibility] =
    useState<PromptVisibilityValue>("private");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 公開停止中コンテンツの再投稿を試みたときの案内ダイアログ
  const [suspendedDialogOpen, setSuspendedDialogOpen] = useState(false);
  // 呼び出し元から beforeImageUrl が渡されていない場合に自動取得した URL。
  // ImageModal が事前に取得済みの値を共有 cache から同期取得することで、
  // モーダルが開いた瞬間に Before 画像が表示できるようにする。
  const [autoFetchedBeforeUrl, setAutoFetchedBeforeUrl] = useState<
    string | null
  >(() => {
    if (!imageId) return null;
    return beforeImageUrlCache.get(imageId) ?? null;
  });

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
    if (beforeImageUrlCache.has(imageId)) {
      // ImageModal などが先行取得済みの値を再利用
      setAutoFetchedBeforeUrl(beforeImageUrlCache.get(imageId) ?? null);
      return;
    }
    let cancelled = false;
    fetchBeforeSourceUrl(imageId).then((url) => {
      if (cancelled) return;
      cacheBeforeImageUrl(imageId, url);
      setAutoFetchedBeforeUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [open, imageId, beforeImageUrl]);

  // 表示優先: 親から渡された URL > 自動取得 URL
  const effectiveBeforeImageUrl = beforeImageUrl ?? autoFetchedBeforeUrl;

  // 非公開を選べるのは「じゆうモードで作った自分の root 投稿」だけ。
  // 呼び出し元が種別を渡していない画面では出さない（安全側）。
  const canChoosePromptVisibility =
    generationType === "free" && !sourcePostId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (caption.length > MAX_CAPTION_LENGTH) {
      setError(t("captionTooLong", { max: MAX_CAPTION_LENGTH }));
      return;
    }

    setIsSubmitting(true);
    startPostProgress();

    try {
      const response = await postImageAPI({
        id: imageId,
        caption: caption.trim() || undefined,
        show_before_image: showBeforeImage,
        // トグルを出していない投稿では列を触らない（既存値・既定値を維持）
        ...(canChoosePromptVisibility
          ? { prompt_visibility: promptVisibility }
          : {}),
      }, {
        postFailed: t("postFailed"),
      });

      persistPendingHomePostRefresh({
        action: "posted",
        postId: response.id,
        bonusGranted: response.bonus_granted,
        promptUseBonusGranted: response.prompt_use_bonus_granted,
        bonusMultiplier: response.bonus_multiplier,
        subscriptionPlan: response.subscription_plan,
        generationType: response.generation_type,
      });

      // デイリー投稿特典が付与された場合、通知バッジだけは即時更新する
      if (
        (response.bonus_granted ?? 0) + (response.prompt_use_bonus_granted ?? 0) >
        0
      ) {
        await refreshUnreadCount().catch((error) => {
          console.error("Failed to refresh unread notification count:", error);
        });
      }

      /*
        ⭐ 投稿しても画面を移動しない。

        以前は `window.location.href = "/"` でホームへ**フル遷移**していた。
        ページ全体の読み直しで重いうえ、生成した画面から引き剥がされるので、
        続けてもう1枚つくる人ほど損をしていた。

        完了の合図(トースト・付与モーダル)は `PostProgressHost` が出す。
        ここでは結果をストアへ渡すだけにする。
      */
      onOpenChange(false);
      try {
        await fetch("/api/revalidate/home", { method: "POST" });
      } catch {
        // 無効化に失敗しても投稿自体は成立している
      }
      // 次にホームを開いたとき、新着として一度だけ同期させる
      notifyPendingHomePostRefresh();

      finishPostProgress(response);

      await onPostSuccess?.(response);
    } catch (err) {
      // 公開停止中のコンテンツは DB trigger が再公開を拒否する。
      // エラー文言をそのまま出すのではなく、異議申立てへ案内するダイアログを出す。
      // instanceof ではなく code の構造的チェックで判定する。
      // api.ts をモックするテストでは class が undefined になり instanceof が
      // 例外を投げるため（既存の PostModal テストで実際に発生した）。
      abortPostProgress();

      if (isSuspendedPublishError(err)) {
        setSuspendedDialogOpen(true);
        setIsSubmitting(false);
        return;
      }

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
      <DialogContent className="max-h-[90vh] overflow-x-hidden overflow-y-auto px-3 py-6 sm:max-w-[500px] sm:px-6">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("postModalTitle")}</DialogTitle>
            <DialogDescription>
              {t("postModalDescription", { max: MAX_CAPTION_LENGTH })}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {/* 画像プレビュー（After 左 / Before 右、下端揃え、隙間ゼロ）。
                各画像は Dialog コンテナ幅に対する % で制限し、横長画像も
                必ず収まるようにする（vw ベースだと sm:max-w-[500px] を超えうる）。*/}
            {afterImageUrl && (
              <div className="flex w-full min-w-0 items-end justify-center bg-white">
                <div
                  className={`relative min-w-0 ${
                    showBeforeInPreview ? "max-w-[66%]" : "max-w-full"
                  }`}
                >
                  <Image
                    src={afterImageUrl}
                    alt={t("afterImageAlt")}
                    width={1200}
                    height={1200}
                    className="block h-auto max-h-[30vh] w-auto max-w-full object-contain"
                    sizes="(max-width: 768px) 60vw, 320px"
                  />
                  <div className="absolute bottom-1 right-1 z-10 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    {t("afterImageLabel")}
                  </div>
                </div>
                {showBeforeInPreview && effectiveBeforeImageUrl && (
                  <div className="relative min-w-0 max-w-[34%]">
                    <Image
                      src={effectiveBeforeImageUrl}
                      alt={t("beforeImageAlt")}
                      width={400}
                      height={400}
                      className="block h-auto max-h-[15vh] w-auto max-w-full object-contain"
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
              <HashtagHighlightTextarea
                id="caption"
                value={caption}
                onChange={setCaption}
                placeholder={t("captionPlaceholder")}
                rows={4}
                maxLength={MAX_CAPTION_LENGTH}
                className={isOverLimit ? "border-destructive" : ""}
                disabled={isSubmitting}
              />
              <HashtagSuggestionChips
                imageId={imageId}
                caption={caption}
                onInsert={setCaption}
                maxLength={MAX_CAPTION_LENGTH}
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

            <div className="space-y-1">
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
              {/*
                外したときではなく常に出す。元画像を出さない判断には見せたく
                ない理由があることが多く、外した瞬間に説明が現れるのは実質の
                引き止めになる。チェックする前の判断材料として渡す。
              */}
              <p className="pl-6 text-xs leading-relaxed text-muted-foreground">
                {t("showBeforeImageHint")}
              </p>
            </div>

            {canChoosePromptVisibility && (
              <PromptVisibilityField
                value={promptVisibility}
                onChange={setPromptVisibility}
                disabled={isSubmitting}
                idPrefix="post"
              />
            )}
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

      {/*
        公開停止中コンテンツの再投稿を試みたときの案内。
        責める文面にせず、異議申立てという次の行動を示すことを優先する。
        遷移先の resolver ルートが最新の公開停止判定へ解決して詳細ページへ送る。
      */}
      <AlertDialog open={suspendedDialogOpen} onOpenChange={setSuspendedDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("suspendedDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("suspendedDialogDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("suspendedDialogClose")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                window.location.href = `/my-page/moderation/posts/${imageId}`;
              }}
            >
              {t("suspendedDialogAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
