"use client";

import Link from "next/link";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import type { HomeBanner } from "@/constants/homeBanners";

function isExternalUrl(url: string): boolean {
  const trimmed = url.trim();
  return trimmed.startsWith("http://") || trimmed.startsWith("https://");
}

interface HomeBannerCardProps {
  banner: HomeBanner;
}

/**
 * ホーム画面バナーカードコンポーネント
 * 画像を表示し、クリックで指定されたURLへ遷移
 * 外部URLの場合は <a> タグ（新規タブ）、内部URLは Next.js Link を使用
 */
export function HomeBannerCard({ banner }: HomeBannerCardProps) {
  const linkUrl = banner.linkUrl.trim();
  const card = (
    <Card className="overflow-hidden hover:scale-[1.02] transition-transform duration-200 p-0">
      <div className="relative w-full overflow-hidden bg-gray-100">
        <Image
          src={banner.imageUrl}
          alt={banner.alt}
          width={1200}
          height={400}
          className="w-full h-auto object-cover aspect-[3/1]"
          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
      </div>
    </Card>
  );

  if (isExternalUrl(linkUrl)) {
    return (
      <a
        href={linkUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        {card}
      </a>
    );
  }

  return <Link href={linkUrl} className="block">{card}</Link>;
}
