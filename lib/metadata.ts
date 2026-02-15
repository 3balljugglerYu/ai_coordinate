import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/env";

/**
 * マーケティングページ用のメタデータを生成するヘルパー
 * 共通の openGraph / twitter 構造を提供し、保守性を向上させる
 */
export function createMarketingPageMetadata({
  title,
  description,
  path,
  ogTitle,
  ogDescription,
}: {
  title: string;
  description: string;
  path: string;
  /** OG/Twitter 用タイトル（省略時は title を使用、tokushoho などページタイトルと異なる場合に指定） */
  ogTitle?: string;
  /** OG/Twitter 用説明（省略時は description を使用） */
  ogDescription?: string;
}): Metadata {
  const siteUrl = getSiteUrl();
  const url = siteUrl ? `${siteUrl}${path}` : undefined;
  const fullTitle = `${ogTitle ?? title} | Persta.AI`;

  return {
    title,
    description,
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
