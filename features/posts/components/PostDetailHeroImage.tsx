"use client";

import { useState } from "react";
import Image from "next/image";
import { FEED_CARD_MAX_WIDTH_PX } from "../lib/constants";

/**
 * 投稿詳細のメイン画像。**フィードで見ていた画像をそのまま先に出す。**
 *
 * ## なぜ2枚重ねるのか
 *
 * ホームのカードは `_thumb.webp`、詳細は `_display.webp` を出しており、
 * **URL が違うためブラウザキャッシュが効かず、詳細を開くたびに
 * 148KB を取り直していた**（実測 0.57〜0.77秒）。さっき見たばかりの
 * 画像なのに、詳細では白いまま待たされるのはここが原因。
 *
 * そこで、**キャッシュ済みのサムネイルを下に敷いて即座に描き**、
 * 表示用画像が届いたら上に重ねてフェードインする。フィードから来た人には
 * 画像が実質0秒で出る（X の詳細が一瞬に見えるのと同じ理屈）。
 *
 * ## ⭐ サムネ側は必ず `unoptimized` にすること
 *
 * フィード(`BeforeAfterFrame`)とグリッド(`PostCard`)は **`unoptimized` で
 * 生の `_thumb.webp` を出している**。最適化を通すと URL が
 * `/_next/image?url=…&w=…&q=…` に変わり、**別 URL になってキャッシュに
 * 当たらない**（一覧どうしでキャッシュを共有するために、あちらが意図的に
 * そうしている）。ここだけ最適化を通すと、この繋ぎは黙って無効になる。
 * 画面上は何も変わらないので気づけない。
 *
 * 表示用のほうは最適化を通す。生の `_display.webp` は 229KB だが
 * 最適化すると 1/3 程度になり、しかもサムネの裏で読み込まれるので
 * 変換の往復は体感に出ない。
 *
 * ## 直リンクで開いたとき
 *
 * サムネはキャッシュに無いので1リクエスト増える。ただし表示用より軽く先に
 * 描けるので、**最大コンテンツの描画はむしろ早くなる**。増えるのは転送量だけ。
 */

/**
 * フィードのカードと同じ式。`unoptimized` なので srcset は生成されず URL には
 * 効かないが、将来最適化に戻したときのために揃えておく
 * （`BeforeAfterFrame` の sizes に同じ趣旨のコメントがある）。
 */
const THUMB_SIZES = `(max-width: ${FEED_CARD_MAX_WIDTH_PX}px) 100vw, ${FEED_CARD_MAX_WIDTH_PX}px`;

/**
 * 表示用画像の sizes。詳細の器は `max-w-4xl`(896px) なので、それを超える
 * 解像度は要らない。以前は `80vw` としており、DPR2 の PC で `w=3840`
 * (4K 幅)を要求していた。
 */
const DEFAULT_DISPLAY_SIZES = "(max-width: 896px) 100vw, 896px";

export function PostDetailHeroImage({
  displayUrl,
  thumbnailUrl,
  alt,
  className,
  displaySizes = DEFAULT_DISPLAY_SIZES,
}: {
  /** 表示用の画像(`_display.webp`)。これが本命。 */
  displayUrl: string;
  /**
   * フィード・グリッドで使っているサムネイル(`_thumb.webp`)。
   * 同一なら重ねる意味がないので1枚だけ描く。
   */
  thumbnailUrl?: string | null;
  alt: string;
  className?: string;
  /**
   * 表示用画像の `sizes`。Before/After を横に並べる詳細では After が
   * 66vw に収まるので、既定(全幅)のままだと必要の2倍近い解像度を落としてくる。
   * **サムネ側は `unoptimized` なので影響を受けない**(生 URL のまま)。
   */
  displaySizes?: string;
}) {
  const [displayLoaded, setDisplayLoaded] = useState(false);

  const showThumbLayer = !!thumbnailUrl && thumbnailUrl !== displayUrl;

  if (!showThumbLayer) {
    return (
      <Image
        src={displayUrl}
        alt={alt}
        width={1200}
        height={1200}
        className={className}
        sizes={displaySizes}
        priority
      />
    );
  }

  return (
    <span className="relative block">
      {/*
        下layer: フィードで既に読み込み済みのサムネイル。
        `priority` は付けない(キャッシュにあれば即描画され、無くても
        表示用画像の邪魔をしない)。
      */}
      <Image
        src={thumbnailUrl}
        alt=""
        aria-hidden
        width={1200}
        height={1200}
        className={className}
        sizes={THUMB_SIZES}
        /* フィード・グリッドと同じ生 URL にする。ここが要。 */
        unoptimized
      />
      {/*
        上layer: 本命の表示用画像。読み込み完了までは透明にしておく。
        読み込み前から不透明にすると、下のサムネイルが見えず白飛びする。
      */}
      <Image
        src={displayUrl}
        alt={alt}
        width={1200}
        height={1200}
        className={`absolute inset-0 h-full w-full transition-opacity duration-200 motion-reduce:transition-none ${
          displayLoaded ? "opacity-100" : "opacity-0"
        } ${className ?? ""}`}
        sizes={displaySizes}
        priority
        onLoad={() => setDisplayLoaded(true)}
      />
    </span>
  );
}
