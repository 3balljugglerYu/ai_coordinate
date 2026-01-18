"use client";

import { useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import { homeBanners } from "@/constants/homeBanners";
import { HomeBannerCard } from "./HomeBannerCard";

// Swiperのスタイルをインポート
import "swiper/css";

/**
 * ホーム画面バナー一覧コンポーネント
 * モバイル・タブレット: 1枚表示のカルーセル（スワイプ対応）
 * PC: グリッドレイアウト
 */
export function HomeBannerList() {
  const [swiper, setSwiper] = useState<SwiperType | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // バナーが存在しない場合は何も表示しない
  if (homeBanners.length === 0) {
    return null;
  }

  // ドットインジケーターのクリックハンドラー
  const scrollTo = (index: number) => {
    swiper?.slideTo(index);
  };

  return (
    <div className="mb-8 overflow-x-hidden">
      {/* モバイル・タブレット: カルーセル（1枚表示、スワイプ対応） */}
      <div className="lg:hidden">
        <div className="-mx-4 px-4">
          <Swiper
            modules={[Autoplay]}
            onSwiper={setSwiper}
            onSlideChange={(swiper) => setActiveIndex(swiper.activeIndex)}
            spaceBetween={16}
            slidesPerView={1}
            centeredSlides={true}
            autoplay={{
              delay: 5000,
              disableOnInteraction: false,
            }}
          >
            {homeBanners.map((banner) => (
              <SwiperSlide key={banner.id}>
                <HomeBannerCard banner={banner} />
              </SwiperSlide>
            ))}
          </Swiper>
        </div>

        {/* ドットインジケーター */}
        <div className="flex justify-center gap-2 mt-4">
          {homeBanners.map((_, index) => (
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

      {/* PC: グリッドレイアウト */}
      <div className="hidden lg:grid lg:grid-cols-3 gap-4">
        {homeBanners.map((banner) => (
          <HomeBannerCard key={banner.id} banner={banner} />
        ))}
      </div>
    </div>
  );
}
