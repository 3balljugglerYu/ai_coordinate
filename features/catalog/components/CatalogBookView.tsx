"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Swiper, SwiperSlide } from "swiper/react";
import { Pagination, Keyboard } from "swiper/modules";
import "swiper/css";
import "swiper/css/pagination";
import { CatalogPage, type CatalogPageData } from "./CatalogPage";

/**
 * react-pageflip は SSR 不可。client-only に dynamic import する。
 * （react-pageflip は最終 publish が古いため、Phase 5 で動作確認を必ず実施すること。）
 */
const HTMLFlipBook = dynamic(() => import("react-pageflip"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[600px] w-full items-center justify-center text-slate-400">
      本を準備しています...
    </div>
  ),
});

interface CatalogBookViewProps {
  pages: CatalogPageData[];
  /** 直リンク (/catalog/[slug]/p/[entryId]) からの初期表示位置 */
  initialEntryId?: string;
}

const PC_BREAKPOINT = "(min-width: 1024px)";
const PC_PAGE_WIDTH = 420;
const PC_PAGE_HEIGHT = 560;

/**
 * 絵師カタログの本めくり UI。
 * - PC (>= lg): react-pageflip で見開き 2 ページ + 3D めくり
 * - モバイル: Swiper で 1 ページずつスワイプ
 *
 * 同じ pages データソースを使うので、ブレークポイント切替で UI のみ差し替わる。
 */
export function CatalogBookView({
  pages,
  initialEntryId,
}: CatalogBookViewProps) {
  const [isDesktop, setIsDesktop] = useState(false);
  const [mounted, setMounted] = useState(false);
  const flipBookRef = useRef<unknown>(null);

  // クライアントマウント後に画面幅判定
  // ハイドレーション後に PC/モバイルを切り替えるため setState を使う必要がある。
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(PC_BREAKPOINT);
    const update = () => setIsDesktop(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const initialIndex = initialEntryId
    ? Math.max(
        0,
        pages.findIndex((p) => p.id === initialEntryId),
      )
    : 0;

  if (pages.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500">
        まだページがありません。
      </div>
    );
  }

  // SSR 時はモバイル相当の Swiper を返す (lg 判定が確定するまで簡易表示)
  if (!mounted || !isDesktop) {
    return (
      <div className="mx-auto max-w-md">
        <Swiper
          modules={[Pagination, Keyboard]}
          pagination={{ clickable: true }}
          keyboard={{ enabled: true }}
          initialSlide={initialIndex}
          spaceBetween={16}
          className="catalog-book-mobile"
        >
          {pages.map((page) => (
            <SwiperSlide key={page.id}>
              <div className="aspect-[4/5] w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow">
                <CatalogPage page={page} />
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
        <p className="mt-4 text-center text-xs text-slate-500">
          ← → や スワイプでページをめくれます
        </p>
      </div>
    );
  }

  // PC: 見開き 2 ページの本めくり UI
  return (
    <div className="flex flex-col items-center">
      {/* @ts-expect-error react-pageflip の型定義は古いため any を許容 */}
      <HTMLFlipBook
        width={PC_PAGE_WIDTH}
        height={PC_PAGE_HEIGHT}
        size="fixed"
        startPage={initialIndex}
        drawShadow
        flippingTime={800}
        usePortrait={false}
        showCover={false}
        mobileScrollSupport={false}
        ref={flipBookRef}
        className="catalog-book-desktop"
      >
        {pages.map((page) => (
          <div
            key={page.id}
            className="overflow-hidden border border-slate-200 bg-white shadow-sm"
            style={{ width: PC_PAGE_WIDTH, height: PC_PAGE_HEIGHT }}
          >
            <CatalogPage page={page} />
          </div>
        ))}
      </HTMLFlipBook>
      <p className="mt-4 text-center text-xs text-slate-500">
        ページの端をドラッグするか、← → キーでめくれます
      </p>
    </div>
  );
}
