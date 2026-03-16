import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/env";
import { localizePublicPath, locales, type Locale } from "@/i18n/config";

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
  const alternates =
    siteUrl && locale
      ? {
          canonical: url,
          languages: Object.fromEntries(
            locales.map((entry) => [entry, `${siteUrl}${localizePublicPath(path, entry)}`])
          ),
        }
      : undefined;

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
    },
    twitter: {
      card: "summary",
      title: fullTitle,
      description: ogDescription ?? description,
    },
  };
}
