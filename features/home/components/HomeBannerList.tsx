"use client";

import { homeBanners } from "@/constants/homeBanners";
import { HomeBannerCard } from "./HomeBannerCard";

/**
 * ホーム画面バナー一覧コンポーネント
 * 複数のバナーカードをグリッドレイアウトで表示
 */
export function HomeBannerList() {
  // バナーが存在しない場合は何も表示しない
  if (homeBanners.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
      {homeBanners.map((banner) => (
        <HomeBannerCard key={banner.id} banner={banner} />
      ))}
    </div>
  );
}
