import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/env";
import {
  DEFAULT_LOCALE,
  localizePublicPath,
  locales,
  type Locale,
} from "@/i18n/config";

const DEFAULT_OPEN_GRAPH_IMAGE = {
  path: "/opengraph-image.png",
  width: 1200,
  height: 630,
  alt: "Persta.AI OGP image",
} as const;

const DEFAULT_TWITTER_IMAGE_PATH = "/twitter-image.png";

function resolveMetadataAssetUrl(path: string, siteUrl = getSiteUrl()) {
  return siteUrl ? new URL(path, siteUrl).toString() : path;
}

export function createLocaleAlternates(path: string, locale: Locale) {
  const siteUrl = getSiteUrl();
  const canonicalPath = localizePublicPath(path, locale);

  if (!siteUrl) {
    return {
      canonical: canonicalPath,
    };
  }

  return {
    canonical: `${siteUrl}${canonicalPath}`,
    languages: {
      ...Object.fromEntries(
        locales.map((entry) => [entry, `${siteUrl}${localizePublicPath(path, entry)}`])
      ),
      // 言語が一致しない訪問者の既定 URL(hreflang x-default)はデフォルトロケール版
      "x-default": `${siteUrl}${localizePublicPath(path, DEFAULT_LOCALE)}`,
    },
  };
}

/**
 * ロケール分割していない公開ページ(/collections, /creators, /users/[id] 等)用の
 * 自己参照 canonical を生成する。
 *
 * root layout にサイト全体の alternates を置くと、alternates 未定義の全ページが
 * トップページを canonical として継承してしまう(= 検索エンジンに「トップの複製」と
 * 伝わりインデックス対象から外れる)ため、各ページが必ず自分の canonical を宣言する。
 */
export function createCanonicalAlternates(path: string) {
  const siteUrl = getSiteUrl();
  return {
    canonical: siteUrl ? `${siteUrl}${path}` : path,
  };
}

export function getDefaultOpenGraphImages(siteUrl = getSiteUrl()) {
  return [
    {
      url: resolveMetadataAssetUrl(DEFAULT_OPEN_GRAPH_IMAGE.path, siteUrl),
      width: DEFAULT_OPEN_GRAPH_IMAGE.width,
      height: DEFAULT_OPEN_GRAPH_IMAGE.height,
      alt: DEFAULT_OPEN_GRAPH_IMAGE.alt,
    },
  ];
}

export function getDefaultTwitterImages(siteUrl = getSiteUrl()) {
  return [resolveMetadataAssetUrl(DEFAULT_TWITTER_IMAGE_PATH, siteUrl)];
}

/**
 * マーケティングページ用のメタデータを生成するヘルパー
 * 共通の openGraph / twitter 構造を提供し、保守性を向上させる
 */
export function createMarketingPageMetadata({
  title,
  description,
  path,
  locale,
  ogTitle,
  ogDescription,
}: {
  title: string;
  description: string;
  path: string;
  locale?: Locale;
  /** OG/Twitter 用タイトル（省略時は title を使用、tokushoho などページタイトルと異なる場合に指定） */
  ogTitle?: string;
  /** OG/Twitter 用説明（省略時は description を使用） */
  ogDescription?: string;
}): Metadata {
  const siteUrl = getSiteUrl();
  const canonicalPath = locale ? localizePublicPath(path, locale) : path;
  const url = siteUrl ? `${siteUrl}${canonicalPath}` : undefined;
  const fullTitle = `${ogTitle ?? title} | Persta.AI`;
  const alternates = locale ? createLocaleAlternates(path, locale) : undefined;
  const openGraphImages = getDefaultOpenGraphImages(siteUrl);
  const twitterImages = getDefaultTwitterImages(siteUrl);

  return {
    title,
    description,
    alternates,
    openGraph: {
      title: fullTitle,
      description: ogDescription ?? description,
      url,
      siteName: "Persta.AI",
      type: "website",
      images: openGraphImages,
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: ogDescription ?? description,
      images: twitterImages,
    },
  };
}
