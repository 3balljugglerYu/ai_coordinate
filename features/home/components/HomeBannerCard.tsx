"use client";

import Link from "next/link";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import {
  HOME_BANNER_IMAGE_HEIGHT,
  HOME_BANNER_IMAGE_SIZES,
  HOME_BANNER_IMAGE_WIDTH,
} from "../lib/home-banner-image";
import type { HomeBanner } from "@/constants/homeBanners";
import { trackHomeBannerClick } from "../lib/home-banner-events";
import { toSafeLinkUrl } from "@/lib/security/safe-link-url";

function isExternalUrl(url: string): boolean {
  const trimmed = url.trim();
  return trimmed.startsWith("https://");
}

/** 安全な行き先のみ許可（javascript: 等の XSS・よそのサイトへ移すパスを防止） */
function getSafeLinkUrl(url: string): string {
  return toSafeLinkUrl(url) ?? "#";
}

interface HomeBannerCardProps {
  banner: HomeBanner;
  prioritizeImage?: boolean;
}

/**
 * ホーム画面バナーカードコンポーネント
 * 画像を表示し、クリックで指定されたURLへ遷移
 * 外部URLの場合は <a> タグ（新規タブ）、内部URLは Next.js Link を使用
 */
export function HomeBannerCard({
  banner,
  prioritizeImage = false,
}: HomeBannerCardProps) {
  const linkUrl = getSafeLinkUrl(banner.linkUrl);
  const card = (
    <Card className="overflow-hidden hover:scale-[1.02] transition-transform duration-200 p-0">
      <div className="relative w-full overflow-hidden bg-gray-100">
        <Image
          src={banner.imageUrl}
          alt={banner.alt}
          width={HOME_BANNER_IMAGE_WIDTH}
          height={HOME_BANNER_IMAGE_HEIGHT}
          className="w-full h-auto object-cover aspect-[3/1]"
          sizes={HOME_BANNER_IMAGE_SIZES}
          priority={prioritizeImage}
          loading={prioritizeImage ? "eager" : undefined}
        />
      </div>
    </Card>
  );

  const trackClick = () => trackHomeBannerClick(banner.id, linkUrl);

  if (isExternalUrl(linkUrl)) {
    return (
      <a
        href={linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
        onClick={trackClick}
      >
        {card}
      </a>
    );
  }

  return (
    <Link href={linkUrl} className="block" onClick={trackClick}>
      {card}
    </Link>
  );
}
