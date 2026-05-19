"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperInstance } from "swiper/types";
import { Pagination, Keyboard, A11y } from "swiper/modules";
import "swiper/css";
import "swiper/css/pagination";
import { CatalogPage, type CatalogPageData } from "./CatalogPage";
import { BookCover } from "./BookCover";

/**
 * react-pageflip は SSR 不可。client-only に dynamic import する。
 */
const HTMLFlipBook = dynamic(() => import("react-pageflip"), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-[640px] w-full items-center justify-center text-stone-300"
      style={{ fontFamily: "var(--font-cormorant), serif" }}
    >
      Preparing the book…
    </div>
  ),
});

interface CatalogBookViewProps {
  pages: CatalogPageData[];
  /** 直リンク (/catalog/[slug]/p/[entryId]) からの初期表示位置 */
  initialEntryId?: string;
  /** カバーに表示する企画タイトル */
  campaignTitle: string;
  /** カバーに表示するハッシュタグ (任意) */
  campaignHashtag?: string | null;
  /** カバーに表示する説明文 (任意) */
  campaignDescription?: string | null;
}

const PC_BREAKPOINT = "(min-width: 1024px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const PC_PAGE_WIDTH = 440;
const PC_PAGE_HEIGHT = 600;
const NEXT_FLIP_DURATION_DEFAULT = 900;

// react-pageflip の型定義が古く `Ref<unknown>` 経由で flip メソッドを叩く必要があるため
// 必要な API のみ最小限の interface として宣言する。
interface FlipBookApi {
  flipPrev(corner?: "top" | "bottom"): void;
  flipNext(corner?: "top" | "bottom"): void;
  flip(pageNum: number, corner?: "top" | "bottom"): void;
  getCurrentPageIndex(): number;
  getPageCount(): number;
}
type FlipBookHandle = { pageFlip(): FlipBookApi } | null;

/**
 * 絵師カタログの本めくり UI。
 *
 * 見た目: 革の表紙 + ベージュの紙 + 中央の折り目 + 金箔風の枠。
 * PC は react-pageflip で 3D の見開きめくり、モバイルは Swiper で 1 ページずつ。
 *
 * 構成 (PC):
 *   [Front Cover] [Page 1 | Page 2] [Page 3 | Page 4] ... [Back Cover]
 * 構成 (Mobile):
 *   [Cover] [Page 1] [Page 2] ... [Back Cover]
 */
export function CatalogBookView({
  pages,
  initialEntryId,
  campaignTitle,
  campaignHashtag,
  campaignDescription,
}: CatalogBookViewProps) {
  const [isDesktop, setIsDesktop] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const flipBookRef = useRef<FlipBookHandle>(null);
  const swiperRef = useRef<SwiperInstance | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(PC_BREAKPOINT);
    const motion = window.matchMedia(REDUCED_MOTION_QUERY);
    const update = () => setIsDesktop(mql.matches);
    const updateMotion = () => setReducedMotion(motion.matches);
    update();
    updateMotion();
    mql.addEventListener("change", update);
    motion.addEventListener("change", updateMotion);
    return () => {
      mql.removeEventListener("change", update);
      motion.removeEventListener("change", updateMotion);
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 内容ページのインデックス → 全体（front cover を含む）のインデックスに変換
  const initialContentIndex = initialEntryId
    ? Math.max(
        0,
        pages.findIndex((p) => p.id === initialEntryId),
      )
    : 0;
  // PC: 全体は [front cover, ...pages, back cover]。front cover は index 0
  const initialFlipBookIndex = pages.length === 0 ? 0 : 1 + initialContentIndex;
  // モバイル Swiper: 同様に [cover, ...pages, back cover]
  const initialSwiperIndex = pages.length === 0 ? 0 : 1 + initialContentIndex;

  const flipPrev = useCallback(() => {
    flipBookRef.current?.pageFlip().flipPrev();
  }, []);
  const flipNext = useCallback(() => {
    flipBookRef.current?.pageFlip().flipNext();
  }, []);

  // キーボード ← → でめくる
  useEffect(() => {
    if (!isDesktop) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") flipPrev();
      else if (event.key === "ArrowRight") flipNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isDesktop, flipNext, flipPrev]);

  if (pages.length === 0) {
    return (
      <div
        className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-6 py-16 text-center text-sm text-stone-500"
        style={{ fontFamily: "var(--font-libre), serif" }}
      >
        まだページがありません。
      </div>
    );
  }

  // ===== Mobile / SSR fallback =====
  if (!mounted || !isDesktop) {
    return (
      <BookEnvironment>
        <div className="mx-auto w-full max-w-sm">
          <Swiper
            modules={[Pagination, Keyboard, A11y]}
            pagination={{ clickable: true, dynamicBullets: true }}
            keyboard={{ enabled: true }}
            a11y={{ enabled: true }}
            initialSlide={initialSwiperIndex}
            spaceBetween={16}
            onSwiper={(s) => {
              swiperRef.current = s;
              setCurrentIndex(s.activeIndex);
            }}
            onSlideChange={(s) => setCurrentIndex(s.activeIndex)}
            className="catalog-book-mobile"
          >
            <SwiperSlide>
              <div
                className="aspect-[3/4] w-full overflow-hidden rounded-md shadow-2xl"
                style={{
                  boxShadow:
                    "0 25px 50px -12px rgba(20,10,5,0.5), 0 0 0 1px rgba(0,0,0,0.4)",
                }}
              >
                <BookCover
                  title={campaignTitle}
                  hashtag={campaignHashtag}
                  description={campaignDescription}
                  variant="front"
                />
              </div>
            </SwiperSlide>
            {pages.map((page, i) => (
              <SwiperSlide key={page.id}>
                <div
                  className="aspect-[3/4] w-full overflow-hidden rounded-sm bg-[#f4ead4] shadow-2xl"
                  style={{
                    boxShadow:
                      "0 20px 40px -10px rgba(20,10,5,0.4), 0 0 0 1px rgba(110,80,40,0.2)",
                  }}
                >
                  <CatalogPage
                    page={page}
                    pageNumber={i + 1}
                    side="single"
                  />
                </div>
              </SwiperSlide>
            ))}
            <SwiperSlide>
              <div
                className="aspect-[3/4] w-full overflow-hidden rounded-md shadow-2xl"
                style={{
                  boxShadow:
                    "0 25px 50px -12px rgba(20,10,5,0.5), 0 0 0 1px rgba(0,0,0,0.4)",
                }}
              >
                <BookCover
                  title={campaignTitle}
                  hashtag={campaignHashtag}
                  variant="back"
                />
              </div>
            </SwiperSlide>
          </Swiper>

          {/* モバイル用のナビ + ページ番号 */}
          <div className="mt-6 flex items-center justify-between px-2">
            <button
              type="button"
              onClick={() => swiperRef.current?.slidePrev()}
              disabled={currentIndex === 0}
              aria-label="前のページ"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-900/80 text-stone-100 shadow-md transition-opacity hover:bg-stone-900 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span
              className="text-xs uppercase tracking-[0.3em] text-stone-500"
              style={{ fontFamily: "var(--font-libre), serif" }}
            >
              {Math.max(0, currentIndex)} / {pages.length + 1}
            </span>
            <button
              type="button"
              onClick={() => swiperRef.current?.slideNext()}
              disabled={currentIndex >= pages.length + 1}
              aria-label="次のページ"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-900/80 text-stone-100 shadow-md transition-opacity hover:bg-stone-900 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <p
            className="mt-5 text-center text-xs italic text-stone-500"
            style={{ fontFamily: "var(--font-cormorant), serif" }}
          >
            スワイプ、または下のボタンでページをめくれます。
          </p>
        </div>
      </BookEnvironment>
    );
  }

  // ===== PC =====
  const totalPagesIncludingCovers = pages.length + 2;
  const isAtFront = currentIndex === 0;
  const isAtBack = currentIndex >= totalPagesIncludingCovers - 1;

  return (
    <BookEnvironment>
      <div className="relative flex flex-col items-center">
        {/* 本の左右の navigation ボタン */}
        <button
          type="button"
          onClick={flipPrev}
          disabled={isAtFront}
          aria-label="前のページへ"
          className="group absolute left-[-72px] top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-stone-900/80 text-stone-100 shadow-lg transition-all hover:bg-stone-900 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-20 disabled:hover:scale-100"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <button
          type="button"
          onClick={flipNext}
          disabled={isAtBack}
          aria-label="次のページへ"
          className="group absolute right-[-72px] top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-stone-900/80 text-stone-100 shadow-lg transition-all hover:bg-stone-900 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-20 disabled:hover:scale-100"
        >
          <ChevronRight className="h-6 w-6" />
        </button>

        {/* 本体 (react-pageflip は client-only) */}
        <div
          className="relative"
          style={{
            // 本全体に深い陰影を足して、テーブルに置いた書籍のように見せる
            filter: "drop-shadow(0 40px 35px rgba(20,10,5,0.5))",
          }}
        >
          {/* @ts-expect-error react-pageflip の型定義が古い */}
          <HTMLFlipBook
            width={PC_PAGE_WIDTH}
            height={PC_PAGE_HEIGHT}
            size="fixed"
            startPage={initialFlipBookIndex}
            drawShadow
            maxShadowOpacity={0.5}
            flippingTime={reducedMotion ? 200 : NEXT_FLIP_DURATION_DEFAULT}
            showCover
            usePortrait={false}
            mobileScrollSupport={false}
            ref={flipBookRef}
            onFlip={(e: { data: number }) => setCurrentIndex(e.data)}
            className="catalog-book-desktop"
          >
            {/* Front cover (hard cover) */}
            <div
              data-density="hard"
              style={{ width: PC_PAGE_WIDTH, height: PC_PAGE_HEIGHT }}
              className="overflow-hidden"
            >
              <BookCover
                title={campaignTitle}
                hashtag={campaignHashtag}
                description={campaignDescription}
                variant="front"
              />
            </div>

            {/* Content pages */}
            {pages.map((page, i) => (
              <div
                key={page.id}
                style={{ width: PC_PAGE_WIDTH, height: PC_PAGE_HEIGHT }}
                className="overflow-hidden"
              >
                <CatalogPage
                  page={page}
                  pageNumber={i + 1}
                  side={i % 2 === 0 ? "right" : "left"}
                />
              </div>
            ))}

            {/* Back cover (hard cover) */}
            <div
              data-density="hard"
              style={{ width: PC_PAGE_WIDTH, height: PC_PAGE_HEIGHT }}
              className="overflow-hidden"
            >
              <BookCover title={campaignTitle} variant="back" />
            </div>
          </HTMLFlipBook>
        </div>

        {/* ページインジケータ */}
        <div className="mt-8 flex items-center gap-3">
          <span
            className="text-xs uppercase tracking-[0.4em] text-stone-300"
            style={{ fontFamily: "var(--font-libre), serif" }}
          >
            {isAtFront
              ? "Cover"
              : isAtBack
                ? "Back"
                : `${currentIndex} / ${pages.length}`}
          </span>
        </div>

        <p
          className="mt-3 text-center text-sm italic text-stone-400"
          style={{ fontFamily: "var(--font-cormorant), serif" }}
        >
          Drag the page corner — or press ← / → — to turn the page.
        </p>
      </div>
    </BookEnvironment>
  );
}

/**
 * 本の周囲の「書斎」のような陰影バックグラウンド。
 * 中央に柔らかい光を集め、書籍の存在感を際立たせる。
 */
function BookEnvironment({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl px-4 py-10 sm:px-8 sm:py-14"
      style={{
        background:
          "radial-gradient(ellipse at center top, #3a2a20 0%, #1f1410 60%, #120906 100%)",
      }}
    >
      {/* ビネット (うすい四隅の暗さ) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.55) 100%)",
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
