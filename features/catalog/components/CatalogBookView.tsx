"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
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
  /** front cover に表示するサムネイル画像 URL (任意。カタログ一覧と同じ画像) */
  campaignCoverImageUrl?: string | null;
  /** 画面中央タップ時に呼ばれる (Kobo 風に UI chrome を開閉するトグル用) */
  onCenterTap?: () => void;
}

// 本のサイズは利用可能領域 (bookContainerRef) を実測し、その縦横比に合わせて
// width / height を react-pageflip へ渡す。固定比率だと端末ごとに上下 or 左右へ
// 余白が出るため、実測比率に合わせることで端末を問わず本を画面へ密着させる。
// min / max はスケールの下限・上限ガード。
const PAGE_MIN_WIDTH = 280;
const PAGE_MAX_WIDTH = 760;
const PAGE_MIN_HEIGHT = 380;
const PAGE_MAX_HEIGHT = 1560;
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
/**
 * react-pageflip 内部の Page / PageCollection に到達するための型 (公開 API ではない)。
 * showCover 有効時に library が front cover へ強制する hard density を soft に
 * 戻すためだけに参照する。
 */
type PageInternal = { setDensity(density: "soft" | "hard"): void };
type PageCollectionInternal = { getPages(): PageInternal[] };

type PageFlipInstance = FlipBookApi & {
  flipController?: FlipControllerInternal;
  getPageCollection?(): PageCollectionInternal;
  updateFromHtml?(items: unknown): void;
  /** ドラッグ中なら true。userStop ラップで click-flip だけ抑止する判定に使う。 */
  isUserMove?: boolean;
  /** タッチ / マウス操作の終了処理。click-flip を抑止するためにラップする。 */
  userStop?(point: { x: number; y: number }, skipFlip?: boolean): void;
};

type FlipBookHandle = {
  pageFlip(): PageFlipInstance;
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
 * 操作: ページ角ドラッグ / スワイプ / キーボード ← → / 3 ゾーンタップ
 * (左 = 前ページ、右 = 次ページ、中央 = onCenterTap で chrome 開閉)。
 */
export function CatalogBookView({
  pages,
  initialEntryId,
  campaignTitle,
  campaignHashtag,
  campaignDescription,
  campaignCoverImageUrl,
  onCenterTap,
}: CatalogBookViewProps) {
  const [mounted, setMounted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [orientation, setOrientation] = useState<"landscape" | "portrait">(
    "landscape",
  );
  // 利用可能領域の実測サイズ。確定するまで本は描画しない (比率を合わせるため)。
  const [bookSize, setBookSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  const flipBookRef = useRef<FlipBookHandle>(null);
  const bookContainerRef = useRef<HTMLDivElement | null>(null);

  // onCenterTap は親の再レンダーで identity が変わるため、ジェスチャ effect が
  // 毎回 re-bind しないよう ref 経由で常に最新を参照する。
  const onCenterTapRef = useRef(onCenterTap);
  useEffect(() => {
    onCenterTapRef.current = onCenterTap;
  }, [onCenterTap]);

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

  /**
   * 本のコンテナ (bookContainerRef = 利用可能領域いっぱい) を実測し、その縦横比を
   * react-pageflip の width / height へ渡すための bookSize を確定する。
   * 実測サイズに比率を合わせることで、本が画面に対し上下・左右とも密着する。
   * 初回 (非ゼロサイズ) のみ確定し、以降のリサイズは size="stretch" に委ねる。
   */
  useEffect(() => {
    if (!mounted) return;
    const el = bookContainerRef.current;
    if (el == null) return;
    const observer = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr != null && cr.width > 0 && cr.height > 0) {
        setBookSize({ w: Math.round(cr.width), h: Math.round(cr.height) });
        observer.disconnect();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [mounted]);

  // 内容ページのインデックス → 全体（front cover を含む）のインデックスに変換
  const initialContentIndex = initialEntryId
    ? Math.max(
        0,
        pages.findIndex((p) => p.id === initialEntryId),
      )
    : 0;
  // initialEntryId 指定時 (直リンク) は該当ページから、未指定時 (通常ランディング)
  // は front cover (index 0) から開く。
  const initialFlipIndex =
    pages.length === 0 || initialEntryId == null
      ? 0
      : 1 + initialContentIndex;

  /**
   * page-flip は showCover 有効時、createSpread() 内で front cover (先頭ページ) を
   * 強制的に hard density にする。data-density 属性では上書きできないため、内部
   * PageCollection の先頭ページを直接 soft へ戻し、front cover を内容ページと同じ
   * 紙めくりアニメーションでめくれるようにする。
   */
  const applySoftFrontCover = useCallback(() => {
    try {
      const collection = flipBookRef.current?.pageFlip().getPageCollection?.();
      collection?.getPages()[0]?.setDensity("soft");
    } catch {
      // page-flip の内部実装が変わった場合は front cover が hard のままになるだけ
    }
  }, []);

  const pageFlipPatchedRef = useRef(false);

  /**
   * page-flip 本体への一度きりの内部パッチを onInit で適用する。
   *  1. updateFromHtml をラップ: 祖先の再レンダーごとに createSpread() が front cover
   *     を hard density に戻すため、更新のたびに soft 化パッチを再適用する。
   *  2. userStop をラップ: page-flip 標準の「クリック / タップでめくる」挙動を抑止する。
   *     ページ送りは下の 3 ゾーンタップで自前に処理するため。userStop は click のとき
   *     flip()、ドラッグのとき stopMove() を呼ぶので、ドラッグ無し (isUserMove=false)
   *     かつ非 skip のときだけ skipFlip=true に差し替えて flip だけを落とす。
   *     disableFlipByClick 設定では角クリックが例外的に残り、end イベントを握り潰すと
   *     内部状態 (touchPoint / isUserTouch) が壊れるため、この方法が最も安全。
   */
  const handleBookInit = useCallback(
    (mode: "landscape" | "portrait") => {
      setOrientation(mode);
      const pageFlip = flipBookRef.current?.pageFlip();
      if (pageFlip != null && !pageFlipPatchedRef.current) {
        pageFlipPatchedRef.current = true;

        const originalUpdate = pageFlip.updateFromHtml?.bind(pageFlip);
        if (originalUpdate != null) {
          pageFlip.updateFromHtml = (items: unknown) => {
            originalUpdate(items);
            applySoftFrontCover();
          };
        }

        const originalUserStop = pageFlip.userStop?.bind(pageFlip);
        if (originalUserStop != null) {
          pageFlip.userStop = (point, skipFlip) => {
            // ドラッグ完了 (isUserMove=true → stopMove) と明示 skip はそのまま通す。
            // ドラッグ無しのクリック / タップ (isUserMove=false) のみ flip を落とす。
            if (skipFlip || pageFlip.isUserMove !== false) {
              originalUserStop(point, skipFlip);
            } else {
              originalUserStop(point, true);
            }
          };
        }
      }
      applySoftFrontCover();
    },
    [applySoftFrontCover],
  );

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
   * タップ / スワイプのジェスチャ処理。document の capture フェーズで端末イベントを監視する。
   *
   * - タップ (移動量が小さい): 画面を左 / 中央 / 右の 3 ゾーンに分け、
   *   左 = 前ページ、右 = 次ページ、中央 = onCenterTap (UI chrome 開閉)。
   *   page-flip 標準の click-flip は handleBookInit の userStop ラップで抑止済みなので、
   *   ここでは end イベントを握り潰さず (内部クリーンアップを壊さず) 自前にめくる。
   * - スワイプ / ドラッグ: page-flip 本体の fold アニメーションに任せる。ただし
   *   portrait の FORWARD ドラッグだけは、page-flip が画面内クランプで snap-back して
   *   しまうため intercept して animateFlippingTo で完了させる (既存ロジック)。
   *
   * リンク / ボタン上のタップには関与しない (リンク遷移を妨げない)。
   */
  useEffect(() => {
    const el = bookContainerRef.current;
    if (el == null) return;

    const TAP_MAX_MOVE = 24; // これ以下の移動量はタップ扱い (px)
    const TAP_EDGE_RATIO = 0.3; // 中央ゾーンは 30〜70%。左右はそれぞれ端 30%
    const SYNTHETIC_MOUSE_GUARD_MS = 700; // touch 後に発火する合成 mouse を無視する猶予
    const LIB_SWIPE_TIMEOUT = 250; // ライブラリの swipeTimeout に合わせる
    const DRAG_MIN_RATIO = 0.2; // コンテナ幅に対する横移動の最低比率

    let startX = 0;
    let startY = 0;
    let startedAt = 0;
    let tracking = false;
    let isTouchGesture = false;
    let movedBeyondTap = false; // ジェスチャ中に一度でもタップ閾値を超えたか
    let touchActiveUntil = 0; // この時刻まで合成 mouse イベントを無視する

    const begin = (
      x: number,
      y: number,
      target: EventTarget | null,
      touch: boolean,
    ) => {
      if (target == null || !el.contains(target as Node)) {
        tracking = false;
        return;
      }
      tracking = true;
      isTouchGesture = touch;
      movedBeyondTap = false;
      startX = x;
      startY = y;
      startedAt = Date.now();
    };

    const trackMove = (x: number, y: number) => {
      if (!tracking || movedBeyondTap) return;
      if (
        Math.abs(x - startX) > TAP_MAX_MOVE ||
        Math.abs(y - startY) > TAP_MAX_MOVE
      ) {
        movedBeyondTap = true;
      }
    };

    const finish = (
      x: number,
      y: number,
      target: EventTarget | null,
      e: Event,
    ) => {
      if (!tracking) return;
      tracking = false;
      if (target == null || !el.contains(target as Node)) return;
      const dx = x - startX;
      const dy = y - startY;
      const dt = Date.now() - startedAt;

      // --- タップ (3 ゾーン) ---
      if (!movedBeyondTap) {
        // ページ内のリンク / ボタン上のタップには関与しない
        if ((target as HTMLElement).closest?.("a, button") != null) return;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0) return;
        const ratio = (x - rect.left) / rect.width;
        const api = flipBookRef.current?.pageFlip();
        // page-flip 標準の click-flip は userStop ラップで抑止済み。end イベントは
        // 握り潰さないので touchPoint / isUserTouch のクリーンアップはそのまま走る。
        if (ratio < TAP_EDGE_RATIO) api?.flipPrev();
        else if (ratio > 1 - TAP_EDGE_RATIO) api?.flipNext();
        else onCenterTapRef.current?.();
        return;
      }

      // --- portrait FORWARD ドラッグの完了補完 (既存ロジック / touch 専用) ---
      // page-flip 本体は touchend で次の 2 経路を持つ:
      //   (a) 速いスワイプ (dt < 250ms かつ |dx| > swipeDistance) → flipNext / flipPrev
      //   (b) ゆっくりドラッグ → pos.x <= 0 なら flip、それ以外は snap-back
      // portrait では bounds.left = -pageWidth のため、画面左端まで指を引いても
      // pos.x が 0 に届かず flip が完了しない。capture-phase で touchend を握り潰し、
      // 十分な横移動があれば手動で完了させる。
      if (!isTouchGesture || orientation !== "portrait") return;
      // 速いスワイプはライブラリに任せる (2 重発火防止)
      if (dt < LIB_SWIPE_TIMEOUT) return;
      // 縦移動が横移動より大きい場合は縦スクロール意図とみなす
      if (Math.abs(dy) > Math.abs(dx)) return;
      const width = el.getBoundingClientRect().width;
      if (width <= 0) return;
      if (Math.abs(dx) < width * DRAG_MIN_RATIO) return;
      // BACK 方向 (右ドラッグ = 前ページ) は library 側で `pos.x <= 0` が常に成立し、
      // stopMove が自然に flip を完了させる (calc 座標が FORWARD と対称なため)。
      // intercept で animateFlippingTo を呼び直すと、portrait の clamp により
      // sweep 距離が短く違和感が出るので、BACK は library のネイティブ完了アニメに任せる。
      if (dx > 0) return;

      // FORWARD 方向 (左ドラッグ = 次ページ) は library が `pos.x > 0` で snap-back
      // してしまうため、intercept して手動で完了させる。
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

    const onTouchStart = (e: TouchEvent) => {
      touchActiveUntil = Date.now() + SYNTHETIC_MOUSE_GUARD_MS;
      if (e.touches.length !== 1) {
        tracking = false;
        return;
      }
      begin(e.touches[0]!.clientX, e.touches[0]!.clientY, e.target, true);
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t != null) trackMove(t.clientX, t.clientY);
    };
    const onTouchEnd = (e: TouchEvent) => {
      touchActiveUntil = Date.now() + SYNTHETIC_MOUSE_GUARD_MS;
      const t = e.changedTouches[0];
      if (t == null) {
        tracking = false;
        return;
      }
      finish(t.clientX, t.clientY, e.target, e);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (Date.now() < touchActiveUntil) return; // touch 由来の合成イベントは無視
      if (e.button !== 0) return;
      begin(e.clientX, e.clientY, e.target, false);
    };
    const onMouseMove = (e: MouseEvent) => {
      if (Date.now() < touchActiveUntil) return;
      trackMove(e.clientX, e.clientY);
    };
    const onMouseUp = (e: MouseEvent) => {
      if (Date.now() < touchActiveUntil) return;
      finish(e.clientX, e.clientY, e.target, e);
    };

    const opts = { capture: true } as const;
    const passiveOpts = { capture: true, passive: true } as const;
    document.addEventListener("touchstart", onTouchStart, passiveOpts);
    document.addEventListener("touchmove", onTouchMove, passiveOpts);
    document.addEventListener("touchend", onTouchEnd, opts);
    document.addEventListener("mousedown", onMouseDown, passiveOpts);
    document.addEventListener("mousemove", onMouseMove, passiveOpts);
    document.addEventListener("mouseup", onMouseUp, opts);
    return () => {
      document.removeEventListener("touchstart", onTouchStart, opts);
      document.removeEventListener("touchmove", onTouchMove, opts);
      document.removeEventListener("touchend", onTouchEnd, opts);
      document.removeEventListener("mousedown", onMouseDown, opts);
      document.removeEventListener("mousemove", onMouseMove, opts);
      document.removeEventListener("mouseup", onMouseUp, opts);
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

  // 実測領域 (bookSize) の縦横比に合わせて 1 ページぶんの width / height を決める。
  // landscape (見開き) では 1 ページ = 横半分。
  const isPortraitLayout = bookSize != null && bookSize.w < 2 * PAGE_MIN_WIDTH;
  const flipWidth =
    bookSize == null
      ? 0
      : isPortraitLayout
        ? bookSize.w
        : Math.round(bookSize.w / 2);
  const flipHeight = bookSize?.h ?? 0;

  return (
    <div className="mx-auto flex h-full w-full max-w-[1100px] justify-center">
      {mounted ? (
        <div
          ref={bookContainerRef}
          className="relative h-full w-full"
          style={{
            filter: "drop-shadow(0 25px 25px rgba(20,10,5,0.25))",
          }}
        >
          {bookSize != null ? (
            <>
              {/* @ts-expect-error react-pageflip の型定義が古い */}
              <HTMLFlipBook
                width={flipWidth}
                height={flipHeight}
                size="stretch"
                // autoSize=false: 既定の autoSize は「高さ = 幅 × 比率」を
                // padding-bottom % で固定し viewport 高さを無視するため画面から
                // はみ出す。false にすると size="stretch" が getBlockHeight()
                // (= コンテナ実高さ) でクランプする。さらに width/height へ実測
                // 領域の縦横比を渡すことで、本が画面の上下・左右へ密着する。
                autoSize={false}
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
                onChangeOrientation={(e: {
                  data: "landscape" | "portrait";
                }) => setOrientation(e.data)}
                onInit={(e: { data: { mode: "landscape" | "portrait" } }) =>
                  handleBookInit(e.data.mode)
                }
                // autoSize=false 時、page-flip は .catalog-book に display:block
                // しか付けない。内部の .stf__block (absolute 100%×100%) が実寸を
                // 持てるよう、.catalog-book 自身をコンテナいっぱいに広げる。
                className="catalog-book h-full w-full"
              >
                {/* Front cover。data-density は付けず soft のままにする。showCover
                    有効時は library が createSpread() で hard に戻すため、
                    handleBookInit で updateFromHtml をラップして soft 化を再適用。 */}
                <FlipBookPageWrapper>
                  <BookCover
                    title={campaignTitle}
                    hashtag={campaignHashtag}
                    description={campaignDescription}
                    coverImageUrl={campaignCoverImageUrl}
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
            </>
          ) : (
            <div
              className="flex h-full w-full items-center justify-center text-stone-500"
              style={{ fontFamily: "var(--font-cormorant), serif" }}
            >
              Preparing the book…
            </div>
          )}
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
