"use client";

import { useMemo } from "react";
import Lightbox, { type Slide } from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
// styles.css は app/layout.tsx でグローバル import 済み。

export interface FullscreenImageItem {
  url: string;
  alt: string;
  label?: string;
}

interface ImageFullscreenProps {
  /** 互換用: 単一画像を表示するときに使う。 */
  imageUrl?: string;
  alt?: string;
  /** 複数画像を切替表示する場合はこちらを使う。 */
  images?: FullscreenImageItem[];
  /** images 指定時の初期表示 index。 */
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * 画像の全画面表示コンポーネント
 *
 * 内部実装は `yet-another-react-lightbox` + Zoom plugin に統一。
 * - ピンチ / ダブルタップ / ホイールでズーム
 * - 拡大時のドラッグでパン
 * - 横スワイプ・矢印で前後画像切替（複数画像時）
 * - 下スワイプ / 背景クリック / Esc / 閉じるボタンで閉じる
 *
 * 単一画像（imageUrl + alt）または複数画像（images）に対応する後方互換 API は維持する。
 */
export function ImageFullscreen({
  imageUrl,
  alt,
  images,
  initialIndex = 0,
  isOpen,
  onClose,
}: ImageFullscreenProps) {
  const slides = useMemo<Slide[]>(() => {
    if (images && images.length > 0) {
      return images.map((item) => ({ src: item.url, alt: item.alt }));
    }
    if (imageUrl) {
      return [{ src: imageUrl, alt: alt ?? "" }];
    }
    return [];
  }, [images, imageUrl, alt]);

  if (slides.length === 0) return null;

  return (
    <Lightbox
      open={isOpen}
      close={onClose}
      slides={slides}
      index={initialIndex}
      plugins={[Zoom]}
      animation={{ swipe: 250 }}
      controller={{ closeOnBackdropClick: true, closeOnPullDown: true }}
      carousel={{ finite: true }}
      zoom={{ maxZoomPixelRatio: 5, scrollToZoom: true }}
    />
  );
}
