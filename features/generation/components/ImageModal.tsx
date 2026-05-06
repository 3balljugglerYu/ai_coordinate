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
import { fetchBeforeSourceUrl } from "@/features/posts/lib/api";
import {
  cacheBeforeImageUrl,
  resolveBeforeImageUrlSync,
} from "@/features/posts/lib/before-image-cache";
import { shareOrDownloadGeneratedImage } from "../lib/download-image";

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

  // Before 画像 URL の解決順:
  //   1) DB レコード由来の preGenerationStoragePath から同期導出 → 即時表示で flicker 無し
  //   2) module-level cache hit（過去に API 取得済み） → 同期表示
  //   3) いずれも該当しない場合のみ API fallback（旧データなど）
  const initialBeforeUrl = useMemo<string | null>(() => {
    const synced = resolveBeforeImageUrlSync(currentImage);
    return synced ?? null;
  }, [currentImage]);

  const [beforeImageUrl, setBeforeImageUrl] = useState<string | null>(
    initialBeforeUrl,
  );
  const [slideIndex, setSlideIndex] = useState(0);

  // 同期解決できなかった場合のみ API へ fallback。結果はキャッシュへ保存。
  useEffect(() => {
    setSlideIndex(0);
    const synced = resolveBeforeImageUrlSync(currentImage);
    if (synced !== undefined) {
      setBeforeImageUrl(synced);
      return;
    }
    if (!currentImage?.id) {
      setBeforeImageUrl(null);
      return;
    }
    let cancelled = false;
    fetchBeforeSourceUrl(currentImage.id).then((url) => {
      if (cancelled) return;
      if (currentImage.id) {
        cacheBeforeImageUrl(currentImage.id, url);
      }
      setBeforeImageUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [currentImage]);

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

  const handleSaveImage = useCallback(async () => {
    if (!currentImage) return;
    if (onDownload) {
      onDownload(currentImage);
      return;
    }
    try {
      // モバイルでは Web Share API を優先、デスクトップは通常ダウンロード。
      // リスト・グリッド側の Download ボタンと同じヘルパで挙動を統一する。
      await shareOrDownloadGeneratedImage(currentImage, {
        accessDenied: t("imageAccessDenied"),
        fetchFailed: (statusText) =>
          t("imageFetchFailed", { statusText }),
      });
    } catch (error) {
      console.error("ダウンロードエラー:", error);
      alert(error instanceof Error ? error.message : t("imageDownloadFailed"));
    }
  }, [currentImage, onDownload, t]);

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
        void handleSaveImage();
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
