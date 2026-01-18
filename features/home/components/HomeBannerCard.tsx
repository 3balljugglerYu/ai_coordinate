"use client";

import Link from "next/link";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import type { HomeBanner } from "@/constants/homeBanners";

interface HomeBannerCardProps {
  banner: HomeBanner;
}

/**
 * ホーム画面バナーカードコンポーネント
 * 画像を表示し、クリックで指定されたURLへ遷移
 */
export function HomeBannerCard({ banner }: HomeBannerCardProps) {
  return (
    <Link href={banner.linkUrl} className="block">
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
    </Link>
  );
}
