"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { CatalogPage, type CatalogPageData } from "./CatalogPage";
import { BookCover } from "./BookCover";

/**
 * react-pageflip は SSR 不可。client-only に dynamic import する。
 */
const HTMLFlipBook = dynamic(() => import("react-pageflip"), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-[640px] w-full items-center justify-center text-stone-500"
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

// 1 ページの寸法 (見開きの片側)。size="stretch" + min/max でレスポンシブにスケール。
// 全画面リーダー前提のため、max は viewport 全体を埋めても余裕がある値にする。
const PAGE_WIDTH = 440;
const PAGE_HEIGHT = 600;
const PAGE_MIN_WIDTH = 280;
const PAGE_MAX_WIDTH = 760;
const PAGE_MIN_HEIGHT = 380;
const PAGE_MAX_HEIGHT = 1040;
const FLIP_DURATION_DEFAULT = 900;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

interface FlipBookApi {
  flipPrev(corner?: "top" | "bottom"): void;
  flipNext(corner?: "top" | "bottom"): void;
  flip(pageNum: number, corner?: "top" | "bottom"): void;
  getCurrentPageIndex(): number;
  getPageCount(): number;
}

/**
 * react-pageflip の内部 FlipController に到達するための型 (公開 API ではない)。
 * portrait モードの slow-drag で「角の追従アニメーションを現在位置から続行させる」ため、
 * `animateFlippingTo` を直接呼ぶ用途でのみ参照する。
 */
type FlipControllerInternal = {
  calc:
    | {
        getPosition(): { x: number; y: number };
        getCorner(): "top" | "bottom";
      }
    | null;
  getBoundsRect(): { pageWidth: number; height: number };
  animateFlippingTo(
    start: { x: number; y: number },
    dest: { x: number; y: number },
    isTurned: boolean,
    needReset?: boolean,
  ): void;
};
type FlipBookHandle = {
  pageFlip(): FlipBookApi & { flipController?: FlipControllerInternal };
} | null;

type BookPageCommon = { density?: "hard"; "data-density"?: "hard" };

const FlipBookPageWrapper = forwardRef<
  HTMLDivElement,
  React.PropsWithChildren<BookPageCommon & { className?: string }>
>(function FlipBookPageWrapper(props, ref) {
  const { children, className, density } = props;
  return (
    <div
      ref={ref}
      className={`relative h-full w-full overflow-hidden ${className ?? ""}`}
      data-density={density}
    >
      {children}
    </div>
  );
});

/**
 * 絵師カタログの本めくり UI (PC / モバイル 共通)。
 *
 * react-pageflip 単体で:
 * - PC: 見開き 2 ページの 3D めくり
 * - モバイル: portrait モードに自動切替、1 ページずつめくる
 *
 * UI は本のみ。装飾的なナビ / ページ番号 / 操作説明文は無し。
 * 操作はページ角ドラッグ / スワイプ / キーボード ← → のみ。
 */
export function CatalogBookView({
  pages,
  initialEntryId,
  campaignTitle,
  campaignHashtag,
  campaignDescription,
}: CatalogBookViewProps) {
  const [mounted, setMounted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [orientation, setOrientation] = useState<"landscape" | "portrait">(
    "landscape",
  );
  const flipBookRef = useRef<FlipBookHandle>(null);
  const bookContainerRef = useRef<HTMLDivElement | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined" || !window.matchMedia) return;
    const motion = window.matchMedia(REDUCED_MOTION_QUERY);
    const updateMotion = () => setReducedMotion(motion.matches);
    updateMotion();
    motion.addEventListener("change", updateMotion);
    return () => motion.removeEventListener("change", updateMotion);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 内容ページのインデックス → 全体（front cover を含む）のインデックスに変換
  const initialContentIndex = initialEntryId
    ? Math.max(
        0,
        pages.findIndex((p) => p.id === initialEntryId),
      )
    : 0;
  const initialFlipIndex = pages.length === 0 ? 0 : 1 + initialContentIndex;

  // キーボード ← → でめくる
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") flipBookRef.current?.pageFlip().flipPrev();
      else if (event.key === "ArrowRight")
        flipBookRef.current?.pageFlip().flipNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  /**
   * portrait モード時の slow-drag 完了判定の補完。
   *
   * react-pageflip 本体は touchend で次の 2 経路を持つ:
   *   (a) 速いスワイプ (dt < 250ms かつ |dx| > swipeDistance) → flipNext / flipPrev
   *   (b) ゆっくりドラッグ → pos.x <= 0 なら flip、それ以外は snap-back
   *
   * portrait モードでは bounds.left = -pageWidth のため、視覚的に画面左端まで
   * 指を引いても pos.x は 0 に届かず、ほぼ画面外まで指を引かないと flip が完了しない。
   * 結果、ユーザの体感では「左端までドラッグしたのに戻ってしまう」状態になる。
   *
   * 対応: capture-phase で touchend を握り潰し、十分な横移動があれば手動で flipNext /
   * flipPrev を呼んでライブラリの snap-back を肩代わりする。fold アニメーション自体は
   * ライブラリの touchmove で既に描画されているため、見た目は本来のドラッグ操作のまま。
   */
  useEffect(() => {
    if (orientation !== "portrait") return;
    const el = bookContainerRef.current;
    if (el == null) return;

    let startX = 0;
    let startY = 0;
    let startedAt = 0;
    let tracking = false;
    const LIB_SWIPE_TIMEOUT = 250; // ライブラリの swipeTimeout に合わせる
    const DRAG_MIN_RATIO = 0.2; // コンテナ幅に対する横移動の最低比率

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        tracking = false;
        return;
      }
      if (!el.contains(e.target as Node)) {
        tracking = false;
        return;
      }
      tracking = true;
      startX = e.touches[0]!.clientX;
      startY = e.touches[0]!.clientY;
      startedAt = Date.now();
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      if (!el.contains(e.target as Node)) return;
      const touch = e.changedTouches[0];
      if (touch == null) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const dt = Date.now() - startedAt;
      // 速いスワイプはライブラリに任せる (2 重発火防止)
      if (dt < LIB_SWIPE_TIMEOUT) return;
      // 縦移動が横移動より大きい場合は縦スクロール意図とみなす
      if (Math.abs(dy) > Math.abs(dx)) return;
      const width = el.getBoundingClientRect().width;
      if (width <= 0) return;
      if (Math.abs(dx) < width * DRAG_MIN_RATIO) return;

      // ライブラリの touchend 処理 (snap-back) を抑止して手動で flip
      e.stopImmediatePropagation();
      const api = flipBookRef.current?.pageFlip();
      if (api == null) return;

      // 内部 FlipController にアクセスして、ドラッグ中の calc 位置からそのまま
      // 完了アニメーションを継続させる。public な flipNext / flipPrev は角の初期
      // 位置からアニメをやり直してしまい、画面上で角が一瞬戻ってしまうため。
      const fc = api.flipController;
      if (fc?.calc != null) {
        try {
          const pos = fc.calc.getPosition();
          const rect = fc.getBoundsRect();
          const corner = fc.calc.getCorner();
          const yEnd = corner === "bottom" ? rect.height : 0;
          // dest.x = -pageWidth が「完了側」。direction は calc が保持しているため
          // turnToNext / turnToPrev はアニメ終了時に正しく呼ばれる。
          fc.animateFlippingTo(pos, { x: -rect.pageWidth, y: yEnd }, true);
          return;
        } catch {
          // ライブラリ内部実装が変わった場合は public API にフォールバック
        }
      }

      if (dx < 0) api.flipNext();
      else api.flipPrev();
    };

    document.addEventListener("touchstart", onTouchStart, {
      capture: true,
      passive: true,
    });
    document.addEventListener("touchend", onTouchEnd, {
      capture: true,
    });
    return () => {
      document.removeEventListener("touchstart", onTouchStart, {
        capture: true,
      });
      document.removeEventListener("touchend", onTouchEnd, {
        capture: true,
      });
    };
  }, [orientation]);

  if (pages.length === 0) {
    return (
      <div
        className="rounded-md border border-stone-300 bg-[#f4ead4] px-6 py-16 text-center text-sm text-stone-700"
        style={{ fontFamily: "var(--font-cormorant), serif" }}
      >
        まだページがありません。
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1100px] justify-center">
      {mounted ? (
        <div
          ref={bookContainerRef}
          className="relative w-full"
          style={{
            filter: "drop-shadow(0 25px 25px rgba(20,10,5,0.25))",
          }}
        >
          {/* @ts-expect-error react-pageflip の型定義が古い */}
          <HTMLFlipBook
            width={PAGE_WIDTH}
            height={PAGE_HEIGHT}
            size="stretch"
            minWidth={PAGE_MIN_WIDTH}
            maxWidth={PAGE_MAX_WIDTH}
            minHeight={PAGE_MIN_HEIGHT}
            maxHeight={PAGE_MAX_HEIGHT}
            startPage={initialFlipIndex}
            drawShadow
            maxShadowOpacity={0.5}
            flippingTime={reducedMotion ? 200 : FLIP_DURATION_DEFAULT}
            showCover
            mobileScrollSupport
            swipeDistance={30}
            clickEventForward
            useMouseEvents
            ref={flipBookRef}
            onChangeOrientation={(e: { data: "landscape" | "portrait" }) =>
              setOrientation(e.data)
            }
            onInit={(e: { data: { mode: "landscape" | "portrait" } }) =>
              setOrientation(e.data.mode)
            }
            className="catalog-book"
            style={{ margin: "0 auto" }}
          >
            {/* Front cover (hard cover) */}
            <FlipBookPageWrapper density="hard">
              <BookCover
                title={campaignTitle}
                hashtag={campaignHashtag}
                description={campaignDescription}
                variant="front"
              />
            </FlipBookPageWrapper>

            {/* Content pages */}
            {pages.map((page, i) => (
              <FlipBookPageWrapper key={page.id}>
                <CatalogPage
                  page={page}
                  pageNumber={i + 1}
                  side={
                    orientation === "portrait"
                      ? "single"
                      : i % 2 === 0
                        ? "right"
                        : "left"
                  }
                />
              </FlipBookPageWrapper>
            ))}

            {/* Back cover (hard cover) */}
            <FlipBookPageWrapper density="hard">
              <BookCover title={campaignTitle} variant="back" />
            </FlipBookPageWrapper>
          </HTMLFlipBook>
        </div>
      ) : (
        <div
          className="flex aspect-[3/4] w-full max-w-md items-center justify-center text-stone-500"
          style={{ fontFamily: "var(--font-cormorant), serif" }}
        >
          Preparing the book…
        </div>
      )}
    </div>
  );
}
