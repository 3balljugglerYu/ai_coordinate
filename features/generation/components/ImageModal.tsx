"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { ArrowLeftRight, Download, Plus } from "lucide-react";
import Lightbox, { type Slide } from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
// styles.css は app/layout.tsx でグローバル import 済み。
import type { GeneratedImageData } from "../types";
import { determineFileName } from "@/lib/utils";
import { fetchBeforeSourceUrl } from "@/features/posts/lib/api";

interface ImageModalProps {
  images: GeneratedImageData[];
  initialIndex: number;
  /**
   * 閉じる契機。close 時に表示していた画像が保存促進などで必要な場合があるため、
   * 該当 image を引数で渡す（後方互換のため引数省略でも呼び出せる）。
   */
  onClose: (image?: GeneratedImageData) => void;
  onDownload?: (image: GeneratedImageData) => void;
  onPost?: (image: GeneratedImageData) => void;
  /** チュートリアルStep11（PC）時に投稿・ダウンロードを無効化 */
  disablePostAndDownload?: boolean;
}

function isMobileUserAgent(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * 生成画像の拡大表示モーダル。
 *
 * 内部実装は `yet-another-react-lightbox` + Zoom plugin。
 * クリックされたカード 1 件を対象に、Before 画像があれば 2 スライド構成で
 * 横スワイプ／矢印／トグルボタンで切替できる。
 * - 多カード navigation はモーダルでは行わない（一覧側で開き直す前提）
 * - ピンチ / ダブルタップ / ホイールでズーム、拡大時のドラッグでパン
 *
 * `images` と `initialIndex` の API は後方互換のため維持。`images[initialIndex]` を
 * 対象カードとして用いる。
 */
export function ImageModal({
  images,
  initialIndex,
  onClose,
  onDownload,
  onPost,
  disablePostAndDownload = false,
}: ImageModalProps) {
  const t = useTranslations("coordinate");
  const currentImage = images[initialIndex];

  const [beforeImageUrl, setBeforeImageUrl] = useState<string | null>(null);
  const [slideIndex, setSlideIndex] = useState(0);

  // 該当画像の Before 画像 URL を取得（取得不可の場合はトグル非表示）
  useEffect(() => {
    setBeforeImageUrl(null);
    setSlideIndex(0);
    if (!currentImage?.id || currentImage.isPreview) return;
    let cancelled = false;
    fetchBeforeSourceUrl(currentImage.id).then((url) => {
      if (!cancelled) setBeforeImageUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [currentImage?.id, currentImage?.isPreview]);

  const slides = useMemo<Slide[]>(() => {
    if (!currentImage) return [];
    const result: Slide[] = [
      {
        src: currentImage.url,
        alt: t("generatedImageAltIndexed", { index: 1 }),
      },
    ];
    if (beforeImageUrl) {
      result.push({
        src: beforeImageUrl,
        alt: t("modalBeforeLabel"),
      });
    }
    return result;
  }, [currentImage, beforeImageUrl, t]);

  const handleClose = useCallback(() => {
    onClose(currentImage);
  }, [currentImage, onClose]);

  const handleDownload = useCallback(async () => {
    if (!currentImage) return;
    if (onDownload) {
      onDownload(currentImage);
      return;
    }

    try {
      const response = await fetch(currentImage.url);
      if (response.status === 401 || response.status === 403) {
        throw new Error(t("imageAccessDenied"));
      }
      if (!response.ok) {
        throw new Error(
          t("imageFetchFailed", { statusText: response.statusText }),
        );
      }
      const blob = await response.blob();
      const mimeType =
        blob.type || response.headers.get("content-type") || "image/png";
      const fileName = determineFileName(
        response,
        currentImage.url,
        currentImage.id,
        mimeType,
      );
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      requestAnimationFrame(() => {
        setTimeout(() => URL.revokeObjectURL(objectUrl), 100);
      });
    } catch (error) {
      console.error("ダウンロードエラー:", error);
      alert(error instanceof Error ? error.message : t("imageDownloadFailed"));
    }
  }, [currentImage, onDownload, t]);

  // モバイル: Web Share API（Files）が使える場合はシェアシートを開く。
  // フォールバックは通常のダウンロード。
  const handleShareMobile = useCallback(async () => {
    if (!currentImage) return;
    try {
      const res = await fetch(currentImage.url, { mode: "cors" });
      if (res.status === 401 || res.status === 403) {
        throw new Error(t("imageAccessDenied"));
      }
      if (!res.ok) {
        throw new Error(
          t("imageFetchFailed", { statusText: res.statusText }),
        );
      }
      const blob = await res.blob();
      const mimeType =
        blob.type || res.headers.get("content-type") || "image/png";
      const fileName = determineFileName(
        res,
        currentImage.url,
        currentImage.id,
        mimeType,
      );
      const file = new File([blob], fileName, { type: mimeType });
      if (
        typeof navigator !== "undefined" &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({ files: [file], title: "Persta.AI" });
        return;
      }
      await handleDownload();
    } catch (error) {
      const message =
        error instanceof Error ? error.message.toLowerCase() : "";
      if (
        (error instanceof DOMException && error.name === "AbortError") ||
        message.includes("user gesture") ||
        message.includes("share request")
      ) {
        return;
      }
      console.error("Share Sheet失敗:", error);
      await handleDownload();
    }
  }, [currentImage, handleDownload, t]);

  if (!currentImage) return null;

  const showingBefore = slideIndex === 1 && !!beforeImageUrl;

  const toolbarButtons: ReactNode[] = [];

  // .yarl__button は line-height:0 + padding:8px だけのスタイルで、
  // アイコン+テキストの 2 子要素を横並びに配置するレイアウトは持っていない。
  // そのため inline-flex + gap で明示的に整列させる。line-height は normal に
  // 戻さないとテキストが縦方向に潰れて SVG と重なる。
  const labeledButtonStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    lineHeight: "normal",
    whiteSpace: "nowrap",
  };

  if (beforeImageUrl) {
    toolbarButtons.push(
      <button
        key="toggle-before"
        type="button"
        className="yarl__button"
        style={labeledButtonStyle}
        onClick={() => setSlideIndex(showingBefore ? 0 : 1)}
        aria-label={showingBefore ? t("modalAfterLabel") : t("modalBeforeLabel")}
      >
        <ArrowLeftRight />
        <span>
          {showingBefore ? t("modalBeforeLabel") : t("modalAfterLabel")}
        </span>
      </button>,
    );
  }

  if (onPost && !currentImage.is_posted && !currentImage.isPreview) {
    toolbarButtons.push(
      <button
        key="post"
        type="button"
        className="yarl__button"
        style={labeledButtonStyle}
        disabled={disablePostAndDownload}
        onClick={() => onPost(currentImage)}
        aria-label={t("postAction")}
      >
        <Plus />
        <span>{t("postAction")}</span>
      </button>,
    );
  }

  toolbarButtons.push(
    <button
      key="download"
      type="button"
      className="yarl__button"
      disabled={disablePostAndDownload}
      onClick={() => {
        if (isMobileUserAgent()) {
          void handleShareMobile();
        } else {
          void handleDownload();
        }
      }}
      aria-label={t("downloadAction")}
    >
      <Download />
    </button>,
  );

  toolbarButtons.push("close");

  return (
    <Lightbox
      open={true}
      close={handleClose}
      slides={slides}
      index={slideIndex}
      on={{
        view: ({ index }) => setSlideIndex(index),
      }}
      plugins={[Zoom]}
      animation={{ swipe: 250 }}
      controller={{ closeOnBackdropClick: true, closeOnPullDown: true }}
      carousel={{ finite: true }}
      zoom={{ maxZoomPixelRatio: 5, scrollToZoom: true }}
      toolbar={{ buttons: toolbarButtons }}
    />
  );
}
