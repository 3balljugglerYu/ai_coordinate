"use client";

import { useSyncExternalStore } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  getPendingPostPreview,
  getPendingPostPreviewServerSnapshot,
  matchPendingPostPreview,
  subscribePendingPostPreview,
} from "../lib/pending-post-preview";
import { FEED_CARD_MAX_WIDTH_PX } from "../lib/constants";

/**
 * 詳細ページのスケルトンの画像枠。
 *
 * 一覧からタップして来たときは、**一覧で見ていたサムネイルをそのまま描く**。
 * ブラウザのキャッシュに既にあるので往復ゼロで出る。
 * 直リンク・リロードなど値が無いときは、従来どおりグレーの箱。
 *
 * ## `unoptimized` は外さないこと
 *
 * 一覧（`BeforeAfterFrame` / `PostCard`）は `unoptimized` で生の
 * `_thumb.webp` を出している。ここで最適化を通すと
 * `/_next/image?url=…` という別 URL になり、**キャッシュに当たらず
 * この先出しが丸ごと無意味になる**。画面上は何も変わらないので気づけない。
 *
 * ## 枠の決め方を詳細本体と揃えること
 *
 * `PostDetailStatic` の画像枠と同じ高さの決め方にしてある。
 * ここだけ違うと、サーバー応答が届いた瞬間に画像が跳ねて見える。
 */

/** 一覧のカードと同じ式。`unoptimized` なので URL には効かないが揃えておく。 */
const THUMB_SIZES = `(max-width: ${FEED_CARD_MAX_WIDTH_PX}px) 100vw, ${FEED_CARD_MAX_WIDTH_PX}px`;

/** `/ja/posts/<id>` / `/posts/<id>` から投稿 ID を取り出す。 */
export function extractPostIdFromPathname(
  pathname: string | null
): string | null {
  if (!pathname) return null;
  const matched = /\/posts\/([^/?#]+)/.exec(pathname);
  return matched ? decodeURIComponent(matched[1]) : null;
}

export function PostDetailSkeletonImage() {
  const pathname = usePathname();
  const pending = useSyncExternalStore(
    subscribePendingPostPreview,
    getPendingPostPreview,
    getPendingPostPreviewServerSnapshot
  );
  const preview = matchPendingPostPreview(
    pending,
    extractPostIdFromPathname(pathname)
  );

  if (!preview) {
    return <div className="aspect-square w-full animate-pulse bg-gray-200" />;
  }

  const hasKnownRatio =
    preview.aspectRatio === "portrait" || preview.aspectRatio === "landscape";

  return (
    <div
      className={`relative w-full overflow-hidden bg-white ${
        hasKnownRatio ? "max-h-[50vh]" : "aspect-square"
      }`}
    >
      <Image
        src={preview.thumbnailUrl}
        alt=""
        aria-hidden
        width={1200}
        height={1200}
        sizes={THUMB_SIZES}
        className={`w-full h-auto object-contain ${
          hasKnownRatio ? "max-h-[50vh]" : ""
        }`}
        /* 一覧と同じ生 URL にする。ここが要。 */
        unoptimized
        priority
      />
    </div>
  );
}
