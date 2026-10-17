"use client";

import Image from "next/image";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { LayoutGrid } from "lucide-react";
import { Swiper, SwiperSlide } from "swiper/react";
import { FreeMode } from "swiper/modules";
import { Card } from "@/components/ui/card";
import { HalloweenTargetBadge } from "@/features/campaigns/halloween/components/HalloweenTargetBadge";
import { HALLOWEEN_BEST_SHOT } from "@/features/campaigns/halloween/halloween-best-shot";
import type { CampaignSubmissionItem } from "@/features/campaigns/hashtag-campaign/get-submission-pages";
import { CAMPAIGN_EVENTS, trackCampaignEvent } from "@/features/campaigns/lib/campaign-events";
import "swiper/css";
import "swiper/css/free-mode";

// 「簡単お着替え」のカード(StylePresetPreviewCard)と同じ寸法
const CARD_WIDTH_PX = 180;
const CARD_IMAGE_HEIGHT_PX = 240;
const CARD_TITLE_HEIGHT_PX = 44;

/**
 * ホームの「簡単お着替え！」の上に、期間中だけ出す対象作品の棚(2026-10-17 ユーザー決定)。
 *
 * みんなのカタログ(対象作品)を、簡単お着替えと同じ形のカードで並べる。
 * 画像の左下に「ハロウィン企画対象！」、その下に作者の名前。押すと作品のページ(「このカタログで生成する」がある)へ。
 * 「すべて見る」は、みんなのカタログの企画タブへ。
 *
 * 期間は呼び出し側(サーバー)が決め、期間外は items が空で届く。
 * 企画は日本国内向けなので、日本語の画面だけに出す(簡単お着替えの注記と同じ)。
 */
export function HomeHalloweenCatalogShelf({
  items,
}: {
  items: readonly CampaignSubmissionItem[];
}) {
  const locale = useLocale();
  const t = useTranslations("style");

  if (items.length === 0 || locale !== "ja") {
    return null;
  }

  const { title, caption } = HALLOWEEN_BEST_SHOT.homeShelf;

  return (
    // overflow-x-hidden: Swiper 側は !overflow-visible のため、外側ではみ出しを刈り取る(ほかの棚と同じ)
    <section className="mb-8 overflow-x-hidden" data-testid="home-halloween-catalog-shelf">
      <div className="mb-3 flex items-center justify-between gap-3 px-4 sm:px-0">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900">
            {/* 🔥 はほかの企画の「開催中の企画の棚」と同じ印 */}
            <span aria-hidden="true">🔥 </span>
            {title}
          </h2>
          {/* 狭い幅(320px)で「1カ／ウント！」と言葉の途中で折れないよう、「、」のところで折る */}
          <p className="mt-0.5 text-xs text-slate-500 [word-break:keep-all] [overflow-wrap:anywhere]">
            {caption}
          </p>
        </div>
        {/* 簡単お着替えの「すべて見る」と同じ見た目 */}
        <Link
          href={HALLOWEEN_BEST_SHOT.catalogHref}
          onClick={() => trackCampaignEvent(CAMPAIGN_EVENTS.homeShelfAll)}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {t("styleBrowseAll")}
          <LayoutGrid className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="-mx-4 px-4">
        <Swiper
          modules={[FreeMode]}
          slidesPerView="auto"
          spaceBetween={12}
          freeMode={{ enabled: true, momentum: true, momentumRatio: 0.4 }}
          grabCursor
          allowTouchMove
          className="!overflow-visible"
        >
          {items.map((item) => (
            <SwiperSlide key={item.postId} style={{ width: "auto" }}>
              <Link
                href={`/posts/${encodeURIComponent(item.postId)}`}
                onClick={() => trackCampaignEvent(CAMPAIGN_EVENTS.homeShelfWorkTap)}
                className="block"
                data-testid="home-halloween-shelf-work"
              >
                <Card
                  className="overflow-hidden p-0 transition hover:ring-2 hover:ring-primary/50"
                  style={{
                    width: CARD_WIDTH_PX,
                    height: CARD_IMAGE_HEIGHT_PX + CARD_TITLE_HEIGHT_PX,
                  }}
                >
                  {/* Card の gap が画像と名前のあいだに入らないよう、1つの器に入れる(StylePresetPreviewCard と同じ) */}
                  <div className="flex h-full flex-col overflow-hidden bg-gray-100">
                    <div
                      className="relative w-full overflow-hidden bg-gray-100"
                      style={{ height: CARD_IMAGE_HEIGHT_PX }}
                    >
                      <Image
                        src={item.thumbnailUrl}
                        alt={`${item.authorName}さんの作品`}
                        fill
                        sizes={`${CARD_WIDTH_PX}px`}
                        className="object-cover object-top"
                      />
                      {/* ラベルは左下(2026-10-17 ユーザー指示)。簡単お着替えのカテゴリのラベルと同じ位置 */}
                      <span className="absolute bottom-1.5 left-1.5 z-10">
                        <HalloweenTargetBadge />
                      </span>
                    </div>
                    <div
                      className="flex items-center border-t bg-white px-3"
                      style={{ height: CARD_TITLE_HEIGHT_PX }}
                    >
                      <p className="truncate text-sm font-medium text-slate-900">
                        {item.authorName}
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </section>
  );
}
