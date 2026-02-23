"use client";

import { useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import { HomeBannerCard } from "./HomeBannerCard";
import type { HomeBanner } from "@/constants/homeBanners";

// Swiperのスタイルをインポート
import "swiper/css";

interface HomeBannerListProps {
  banners: HomeBanner[];
}

/**
 * ホーム画面バナー一覧コンポーネント
 * 全デバイス: カルーセル（右に次のスライドを表示、ループ、オートプレイ）
 */
export function HomeBannerList({ banners }: HomeBannerListProps) {
  const [swiper, setSwiper] = useState<SwiperType | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // バナーが存在しない場合は何も表示しない
  if (banners.length === 0) {
    return null;
  }

  // ドットインジケーターのクリックハンドラー
  const scrollTo = (index: number) => {
    swiper?.slideToLoop(index);
  };

  return (
    <div className="mb-8 overflow-x-hidden">
      <div className="-mx-4 px-4">
        <Swiper
          modules={[Autoplay]}
          onSwiper={setSwiper}
          onSlideChange={(swiper) => setActiveIndex(swiper.realIndex)}
          spaceBetween={16}
          slidesPerView={1.5}
          centeredSlides={false}
          loop={true}
          autoplay={{
            delay: 5000,
            disableOnInteraction: false,
          }}
        >
          {banners.map((banner) => (
            <SwiperSlide key={banner.id}>
              <HomeBannerCard banner={banner} />
            </SwiperSlide>
          ))}
        </Swiper>
      </div>

      {/* ドットインジケーター */}
      <div className="flex justify-center gap-2 mt-4">
        {banners.map((_, index) => (
          <button
            key={index}
            onClick={() => scrollTo(index)}
            className={`h-2 rounded-full transition-all duration-300 ${
              index === activeIndex
                ? "w-6 bg-primary"
                : "w-2 bg-gray-300 hover:bg-gray-400"
            }`}
            aria-label={`バナー ${index + 1}に移動`}
          />
        ))}
      </div>
    </div>
  );
}
