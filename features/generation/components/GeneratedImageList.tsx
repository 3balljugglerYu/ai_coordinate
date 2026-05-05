"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Calendar,
  Copy,
  Download,
  Plus,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { copyTextToClipboard } from "@/lib/clipboard";
import { PostModal } from "@/features/posts/components/PostModal";
import type { GeneratedImageData } from "../types";
import { downloadGeneratedImage } from "../lib/download-image";
import { ImageModal } from "./ImageModal";
import {
  COORDINATE_APPLY_FROM_HISTORY_EVENT,
  type CoordinateApplyFromHistoryDetail,
} from "../lib/apply-from-history-event";
import {
  formatImageSize,
  getModelDisplayInfo,
} from "../lib/model-display";

interface GeneratedImageListProps {
  images: GeneratedImageData[];
  isGenerating?: boolean;
  generatingCount?: number;
}

const SCROLL_TO_FORM_SELECTOR = '[data-tour="tour-prompt-input"]';

/**
 * 「詳細画面へ」で /posts/{id} に遷移した後、戻るボタンで /coordinate に
 * 戻った時に元のカード位置までスクロール復帰させるための sessionStorage キー。
 */
const RETURN_TO_IMAGE_ID_STORAGE_KEY = "persta-ai:coordinate-return-to-image-id";

function formatGeneratedAt(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, "0");
  const dd = `${date.getDate()}`.padStart(2, "0");
  const hh = `${date.getHours()}`.padStart(2, "0");
  const mi = `${date.getMinutes()}`.padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
}

export function GeneratedImageList({
  images,
  isGenerating = false,
  generatingCount = 0,
}: GeneratedImageListProps) {
  const t = useTranslations("coordinate");
  const { toast } = useToast();
  const [postModalImage, setPostModalImage] =
    useState<GeneratedImageData | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] =
    useState<number | null>(null);

  const [disablePostAndDownload, setDisablePostAndDownload] = useState(false);
  useEffect(() => {
    const check = () => {
      const isStep11 =
        typeof document !== "undefined" &&
        document.body.hasAttribute("data-tour-step-first-image");
      const isPC = typeof window !== "undefined" && window.innerWidth >= 640;
      setDisablePostAndDownload(Boolean(isStep11 && isPC));
    };
    check();
    const handler = () => check();
    window.addEventListener("resize", handler);
    document.addEventListener("tutorial:step-11-changed", handler);
    return () => {
      window.removeEventListener("resize", handler);
      document.removeEventListener("tutorial:step-11-changed", handler);
    };
  }, []);

  const handleDownload = async (image: GeneratedImageData) => {
    try {
      await downloadGeneratedImage(image, {
        accessDenied: t("imageAccessDenied"),
        fetchFailed: (statusText) =>
          t("imageFetchFailed", { statusText }),
      });
    } catch (error) {
      console.error("ダウンロードエラー:", error);
      toast({
        title: error instanceof Error ? error.message : t("imageDownloadFailed"),
        variant: "destructive",
      });
    }
  };

  const handleCopyPrompt = async (prompt: string | undefined) => {
    if (!prompt) return;
    try {
      await copyTextToClipboard(prompt);
      toast({ title: t("listPromptCopied") });
    } catch (error) {
      console.error("プロンプトコピー失敗:", error);
      toast({
        title: t("listPromptCopyFailed"),
        variant: "destructive",
      });
    }
  };

  // /posts/{id} から戻ってきた時、元のカード位置にスクロール復帰する。
  // images が更新されるたび（無限スクロール後など）に存在を確認し、
  // 見つかったら復帰してキーを消費する。
  useEffect(() => {
    if (typeof window === "undefined") return;
    let storedId: string | null = null;
    try {
      storedId = window.sessionStorage.getItem(RETURN_TO_IMAGE_ID_STORAGE_KEY);
    } catch {
      return;
    }
    if (!storedId) return;
    const target = document.querySelector(
      `[data-coordinate-list-image-id="${CSS.escape(storedId)}"]`,
    );
    if (target instanceof HTMLElement) {
      const prefersReducedMotion =
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      target.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "center",
      });
      try {
        window.sessionStorage.removeItem(RETURN_TO_IMAGE_ID_STORAGE_KEY);
      } catch {
        // sessionStorage 書き込み不可は無視
      }
    }
  }, [images]);

  const handleDetailLinkClick = (imageId: string) => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(RETURN_TO_IMAGE_ID_STORAGE_KEY, imageId);
    } catch {
      // sessionStorage 書き込み不可は無視
    }
  };

  const handleApplyForNextGeneration = (image: GeneratedImageData) => {
    const detail: CoordinateApplyFromHistoryDetail = {
      imageUrl: image.url,
      fileNameHint: image.id,
    };
    document.dispatchEvent(
      new CustomEvent(COORDINATE_APPLY_FROM_HISTORY_EVENT, { detail }),
    );
    if (typeof window !== "undefined") {
      const target = document.querySelector(SCROLL_TO_FORM_SELECTOR);
      if (target instanceof HTMLElement) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
    toast({ title: t("listApplyForNextSuccess") });
  };

  return (
    <div className="space-y-3">
      {/* 生成中スケルトン（生成枚数分） */}
      {isGenerating &&
        generatingCount > 0 &&
        Array.from({ length: generatingCount }).map((_, i) => (
          <Card
            key={`list-skeleton-${i}`}
            className="flex flex-row gap-3 p-3 sm:gap-4 sm:p-4"
          >
            <div className="h-24 w-24 flex-shrink-0 animate-pulse rounded-lg bg-gray-200 sm:h-32 sm:w-32" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-32 animate-pulse rounded bg-gray-200" />
              <div className="h-3 w-full animate-pulse rounded bg-gray-200" />
              <div className="h-3 w-3/4 animate-pulse rounded bg-gray-200" />
            </div>
          </Card>
        ))}

      {images.map((image, index) => {
        const display = getModelDisplayInfo(image.model);
        const sizeLabel = formatImageSize(
          image.width,
          image.height,
          display.defaultSize,
        );
        const createdAtLabel = formatGeneratedAt(image.createdAt);

        const badges = (
          <>
            <span className="inline-flex w-fit items-center rounded-full bg-[#FFF9F4] px-2 py-0.5 text-xs font-medium leading-tight text-[#F084A2] sm:text-sm">
              {display.displayName}
            </span>
            <span className="inline-flex w-fit items-center rounded-full bg-[#FFF9F4] px-2 py-0.5 text-xs font-medium leading-tight text-[#F084A2] sm:text-sm">
              {sizeLabel}
            </span>
            {image.fromStock && (
              <span className="inline-flex w-fit items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium leading-tight text-emerald-700 sm:text-sm">
                {t("listFromStockBadge")}
              </span>
            )}
          </>
        );

        const dateAndDownload = (
          <div className="flex items-start justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
              <Calendar className="h-3.5 w-3.5" />
              {t("listGeneratedAt", { date: createdAtLabel })}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleDownload(image)}
              disabled={disablePostAndDownload}
              aria-label={t("downloadAction")}
              className="h-7 px-2 sm:h-8 sm:px-3"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="ml-1.5 hidden text-xs sm:inline">
                {t("downloadAction")}
              </span>
            </Button>
          </div>
        );

        const promptBlock = (
          <div className="rounded-lg bg-gray-50 p-2.5">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600">
                <Sparkles className="h-3.5 w-3.5" />
                {t("listUsedPromptLabel")}
              </span>
              {image.prompt ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs text-gray-600 hover:text-gray-600"
                  onClick={() => handleCopyPrompt(image.prompt)}
                  aria-label={t("listCopyPrompt")}
                >
                  <Copy className="h-3 w-3 text-gray-600" />
                  <span className="ml-1">{t("listCopyPrompt")}</span>
                </Button>
              ) : null}
            </div>
            <p className="line-clamp-4 whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-700">
              {image.prompt || t("listPromptEmpty")}
            </p>
          </div>
        );

        const actionButtons = (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => handleApplyForNextGeneration(image)}
              className="bg-gradient-to-r from-[#FF7B8A] to-[#FF9A3D] text-white hover:opacity-90"
            >
              <Wand2 className="h-3.5 w-3.5" />
              <span className="ml-1.5">{t("listApplyForNext")}</span>
            </Button>
            {image.is_posted ? (
              <span className="inline-flex h-9 items-center rounded-md border border-emerald-500 bg-emerald-50 px-3 text-sm font-medium text-emerald-700">
                {t("postedBadge")}
              </span>
            ) : (
              !image.isPreview && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPostModalImage(image)}
                  disabled={disablePostAndDownload}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="ml-1.5">{t("postAction")}</span>
                </Button>
              )
            )}
            {image.id && !image.isPreview && (
              <Button size="sm" variant="outline" asChild>
                <Link
                  href={`/posts/${encodeURIComponent(image.id)}?from=coordinate`}
                  onClick={() => handleDetailLinkClick(image.id)}
                >
                  {t("listGoToDetail")}
                </Link>
              </Button>
            )}
          </div>
        );

        return (
          <Card
            key={image.galleryKey ?? image.id}
            data-coordinate-list-image-id={image.id}
            className="gap-0 p-3 sm:p-4"
          >
            <div className="flex flex-row gap-3 sm:gap-4">
              {/* サムネイル */}
              <div className="flex flex-shrink-0 flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedImageIndex(index)}
                  aria-label={t("previewAction")}
                  className="relative h-24 w-24 overflow-hidden rounded-lg border bg-gray-100 sm:h-32 sm:w-32"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt={t("listThumbnailAlt")}
                    className="h-full w-full object-cover"
                  />
                </button>
                {/* PC のみ: サムネイル下にバッジ群 */}
                <div className="hidden flex-col gap-1 text-xs sm:flex">
                  {badges}
                </div>
              </div>

              {/* サムネ右側: 生成日時 + DL（モバイル/PC 共通）。
                  モバイル時はバッジを日時直下に詰めて配置し、サムネ高さを
                  超えないようにする（カードの p-3 余白と整合させるため）。
                  PC 時のみ、下にプロンプト・アクションボタンを表示。 */}
              <div className="flex min-w-0 flex-1 flex-col gap-1 sm:gap-3">
                {dateAndDownload}
                <div className="flex flex-col gap-0.5 sm:hidden">
                  {badges}
                </div>
                <div className="hidden sm:block">{promptBlock}</div>
                <div className="hidden sm:block">{actionButtons}</div>
              </div>
            </div>

            {/* モバイルのみ: サムネ行の下にプロンプト → アクションボタン。
                サムネイル上端〜カード外側と同じ余白（mobile: p-3=12px / PC: p-4=16px）に
                揃えるため mt-3 sm:mt-4 を使用。 */}
            <div className="mt-3 flex flex-col gap-3 sm:hidden">
              {promptBlock}
              {actionButtons}
            </div>
          </Card>
        );
      })}

      {!isGenerating && images.length === 0 && (
        <Card className="border-dashed p-12">
          <p className="text-center text-sm text-gray-500">
            {t("generatedGalleryEmpty")}
          </p>
        </Card>
      )}

      {selectedImageIndex !== null && (
        <ImageModal
          images={images}
          initialIndex={selectedImageIndex}
          onClose={() => setSelectedImageIndex(null)}
          onDownload={handleDownload}
          onPost={(image) => {
            if (image.isPreview) {
              return;
            }
            setPostModalImage(image);
            setSelectedImageIndex(null);
          }}
          disablePostAndDownload={disablePostAndDownload}
        />
      )}

      {postModalImage && (
        <PostModal
          open={!!postModalImage}
          onOpenChange={(open) => {
            if (!open) setPostModalImage(null);
          }}
          imageId={postModalImage.id}
          afterImageUrl={postModalImage.url}
        />
      )}
    </div>
  );
}
