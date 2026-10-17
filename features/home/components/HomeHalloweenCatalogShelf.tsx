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
import type { HomeHalloweenEntryProgressData } from "@/features/home/lib/home-halloween-shelf";
import { CAMPAIGN_EVENTS, trackCampaignEvent } from "@/features/campaigns/lib/campaign-events";
import { useAutoScrollRail } from "@/features/home/hooks/useAutoScrollRail";
import { HomeHalloweenEntryProgress } from "./HomeHalloweenEntryProgress";
import "swiper/css";
import "swiper/css/free-mode";

// 「簡単お着替え」のカード(StylePresetPreviewCard)と同じ寸法
const CARD_WIDTH_PX = 180;
const CARD_IMAGE_HEIGHT_PX = 240;
const CARD_TITLE_HEIGHT_PX = 44;

/**
 * 自動で流すのは、この数から。決まりと理由は企画の設定(homeShelf.autoScrollMinItems)。
 * サーバーの区画も同じ値で簡単お着替えの待ちを決めるので、設定から読む
 * (「use client」のファイルから数を読ませると、サーバーでは値にならない)
 */
export const AUTO_SCROLL_MIN_ITEMS = HALLOWEEN_BEST_SHOT.homeShelf.autoScrollMinItems;
/** 流れている位置を残すキー(簡単お着替えとは別にする) */
const TRANSLATE_STORAGE_KEY = "home-halloween-shelf-translate";
/** 3組のうち、読み上げとキーボードで使う組(最初に見えている真ん中の組) */
const PRIMARY_COPY = "b";

/**
 * ホームの「簡単お着替え！」の上に、期間中だけ出す対象作品の棚(2026-10-17 ユーザー決定)。
 *
 * みんなのカタログ(対象作品)を、簡単お着替えと同じ形のカードで並べる。
 * 画像の左下に「ハロウィン企画対象！」、その下に作者の名前。押すと作品のページ(「このカタログで生成する」がある)へ。
 * 「すべて見る」は、みんなのカタログの企画タブへ。
 *
 * 簡単お着替えと同じように、自動でゆっくり流す(8件から。指で触れている間は止まる)。
 *
 * 期間は呼び出し側(サーバー)が決め、期間外は items が空で届く。
 * 企画は日本国内向けなので、日本語の画面だけに出す(簡単お着替えの注記と同じ)。
 */
export function HomeHalloweenCatalogShelf({
  items,
  entryProgress = null,
}: {
  items: readonly CampaignSubmissionItem[];
  /** エントリーした人の進み具合。未ログイン・未エントリーなら null(何も出さない) */
  entryProgress?: HomeHalloweenEntryProgressData | null;
}) {
  const locale = useLocale();
  const t = useTranslations("style");
  const autoScroll = items.length >= AUTO_SCROLL_MIN_ITEMS;
  // フックは早く返す前に呼ぶ(出さないときは containerRef が空なので、何も動かない)
  const { containerRef, onSwiper, onTouchStart, onTouchEnd, saveTranslate } = useAutoScrollRail({
    itemCount: items.length,
    storageKey: TRANSLATE_STORAGE_KEY,
    enabled: autoScroll,
  });

  if (items.length === 0 || locale !== "ja") {
    return null;
  }

  const { title, caption } = HALLOWEEN_BEST_SHOT.homeShelf;
  // 自動で流すときは3組並べる(つなぎ目を見せないため)。流さないときは1組だけ
  const copies = autoScroll ? (["a", PRIMARY_COPY, "c"] as const) : ([PRIMARY_COPY] as const);

  return (
    // overflow-x-hidden: Swiper 側は !overflow-visible のため、外側ではみ出しを刈り取る(ほかの棚と同じ)
    <section
      ref={containerRef}
      className="mb-8 overflow-x-hidden"
      data-testid="home-halloween-catalog-shelf"
    >
      {/* エントリーした人の進み具合は、棚の上に(2026-10-17 ユーザー指示) */}
      {entryProgress ? <HomeHalloweenEntryProgress usedWorks={entryProgress.usedWorks} /> : null}
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
      {/* Swiper の右から左の向き(RTL)は動かし方の計算が逆になる。流す計算は左から右の向きなので固定する(簡単お着替えと同じ) */}
      <div className="-mx-4 px-4" dir="ltr">
        <Swiper
          onSwiper={onSwiper}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          modules={[FreeMode]}
          slidesPerView="auto"
          spaceBetween={12}
          freeMode={{ enabled: true, momentum: true, momentumRatio: 0.4 }}
          grabCursor
          allowTouchMove
          observer
          observeParents
          className="!overflow-visible"
        >
          {copies.flatMap((copy) =>
            items.map((item) => {
              // 3組並べるときは、真ん中の組だけを読み上げ・キーボードの対象にする(同じ作品を3回読ませない)
              const isDuplicate = copy !== PRIMARY_COPY;
              return (
                <SwiperSlide key={`${item.postId}-${copy}`} style={{ width: "auto" }}>
                  <Link
                    href={`/posts/${encodeURIComponent(item.postId)}`}
                    onClick={() => {
                      // 戻ったときに続きから流すため、移る前に位置を残す
                      saveTranslate();
                      trackCampaignEvent(CAMPAIGN_EVENTS.homeShelfWorkTap);
                    }}
                    aria-hidden={isDuplicate ? true : undefined}
                    tabIndex={isDuplicate ? -1 : undefined}
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
              );
            }),
          )}
        </Swiper>
      </div>
    </section>
  );
}
