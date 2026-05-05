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
import { PostModal } from "@/features/posts/components/PostModal";
import type { GeneratedImageData } from "../types";
import { downloadGeneratedImage } from "../lib/download-image";
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
      await navigator.clipboard.writeText(prompt);
      toast({ title: t("listPromptCopied") });
    } catch (error) {
      console.error("プロンプトコピー失敗:", error);
      toast({
        title: t("listPromptCopyFailed"),
        variant: "destructive",
      });
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

      {images.map((image) => {
        const display = getModelDisplayInfo(image.model);
        const sizeLabel = formatImageSize(
          image.width,
          image.height,
          display.defaultSize,
        );
        const createdAtLabel = formatGeneratedAt(image.createdAt);
        return (
          <Card
            key={image.galleryKey ?? image.id}
            className="flex flex-row gap-3 p-3 sm:gap-4 sm:p-4"
          >
            {/* 左: サムネイル + メタ */}
            <div className="flex flex-shrink-0 flex-col gap-2">
              <div className="relative h-24 w-24 overflow-hidden rounded-lg border bg-gray-100 sm:h-32 sm:w-32">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt={t("listThumbnailAlt")}
                  className="h-full w-full object-cover"
                />
                {image.is_posted && (
                  <div className="absolute right-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] text-white">
                    {t("postedBadge")}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1 text-xs">
                <span className="inline-flex w-fit items-center rounded-full bg-purple-50 px-2 py-0.5 font-medium text-purple-700">
                  {display.displayName}
                </span>
                <span className="inline-flex w-fit items-center rounded-full bg-purple-50 px-2 py-0.5 font-medium text-purple-700">
                  {sizeLabel}
                </span>
                {image.fromStock && (
                  <span className="inline-flex w-fit items-center rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                    {t("listFromStockBadge")}
                  </span>
                )}
              </div>
            </div>

            {/* 右: 情報・アクション */}
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
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
                  className="h-8 px-2 sm:px-3"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="ml-1.5 hidden text-xs sm:inline">
                    {t("downloadAction")}
                  </span>
                </Button>
              </div>

              <div className="rounded-lg bg-gray-50 p-2.5">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700">
                    <Sparkles className="h-3.5 w-3.5" />
                    {t("listUsedPromptLabel")}
                  </span>
                  {image.prompt ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={() => handleCopyPrompt(image.prompt)}
                      aria-label={t("listCopyPrompt")}
                    >
                      <Copy className="h-3 w-3" />
                      <span className="ml-1">{t("listCopyPrompt")}</span>
                    </Button>
                  ) : null}
                </div>
                <p className="line-clamp-4 whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-700">
                  {image.prompt || t("listPromptEmpty")}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => handleApplyForNextGeneration(image)}
                  className="bg-gradient-to-r from-pink-500 to-purple-500 text-white hover:from-pink-600 hover:to-purple-600"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  <span className="ml-1.5">{t("listApplyForNext")}</span>
                </Button>
                {!image.is_posted && !image.isPreview && (
                  <Button
                    size="sm"
                    onClick={() => setPostModalImage(image)}
                    disabled={disablePostAndDownload}
                    className="bg-emerald-500 text-white hover:bg-emerald-600"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span className="ml-1.5">{t("postAction")}</span>
                  </Button>
                )}
                {image.id && !image.isPreview && (
                  <Button
                    size="sm"
                    variant="outline"
                    asChild
                  >
                    <Link href={`/my-page/${encodeURIComponent(image.id)}`}>
                      {t("listGoToDetail")}
                    </Link>
                  </Button>
                )}
              </div>
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
