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
  /**
   * 縦スワイプ時に呼ばれる。UI chrome の表示状態を指定する
   * (下スワイプ = true で表示 / 上スワイプ = false で非表示)。
   */
  onChromeVisibilityChange?: (visible: boolean) => void;
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
 * 操作:
 * - タップ: 左半分 = 前ページ / 右半分 = 次ページ
 * - 横ドラッグ / スワイプ: 左→右 = 前ページ / 右→左 = 次ページ
 * - 縦スワイプ: 下 = UI chrome 表示 / 上 = 非表示 (onChromeVisibilityChange)
 * - キーボード ← →
 */
export function CatalogBookView({
  pages,
  initialEntryId,
  campaignTitle,
  campaignHashtag,
  campaignDescription,
  campaignCoverImageUrl,
  onChromeVisibilityChange,
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

  // onChromeVisibilityChange は親の再レンダーで identity が変わるため、
  // ジェスチャ effect が毎回 re-bind しないよう ref 経由で常に最新を参照する。
  const onChromeVisibilityChangeRef = useRef(onChromeVisibilityChange);
  useEffect(() => {
    onChromeVisibilityChangeRef.current = onChromeVisibilityChange;
  }, [onChromeVisibilityChange]);

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
   *
   * ResizeObserver は常時監視し続ける。回転・iOS のツールバー伸縮・dev の HMR
   * などで領域サイズが変わったら bookSize を更新し、HTMLFlipBook を key で
   * 貼り替えて (react-pageflip は width/height を初期化後に読み直さないため)
   * 常に正しい寸法で描き直す。微小変化は無視して不要な再マウントを避ける。
   */
  useEffect(() => {
    if (!mounted) return;
    const el = bookContainerRef.current;
    if (el == null) return;
    const observer = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr == null || cr.width <= 0 || cr.height <= 0) return;
      const w = Math.round(cr.width);
      const h = Math.round(cr.height);
      setBookSize((prev) => {
        if (
          prev != null &&
          Math.abs(prev.w - w) <= 2 &&
          Math.abs(prev.h - h) <= 2
        ) {
          return prev; // 微小変化は無視 (同一参照を返し再レンダーを起こさない)
        }
        return { w, h };
      });
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

  // 既にパッチ済みの PageFlip インスタンス。key 貼り替えで再マウントされると
  // インスタンスが変わるため、 boolean ではなくインスタンス参照で判定する。
  const patchedInstanceRef = useRef<PageFlipInstance | null>(null);

  /**
   * page-flip 本体への内部パッチを onInit で適用する (インスタンスごとに一度)。
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
      if (pageFlip != null && patchedInstanceRef.current !== pageFlip) {
        patchedInstanceRef.current = pageFlip;

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
   * - タップ (移動量が小さい): 左半分 = 前ページ、右半分 = 次ページ。
   *   page-flip 標準の click-flip は handleBookInit の userStop ラップで抑止済みなので、
   *   ここでは end イベントを握り潰さず (内部クリーンアップを壊さず) 自前にめくる。
   * - 縦スワイプ: 下 = UI chrome 表示 / 上 = 非表示 (onChromeVisibilityChange)。
   * - 横スワイプ / ドラッグ: fold アニメーション自体は page-flip 本体に任せる。速い
   *   スワイプも page-flip 標準の判定に任せる。ゆっくりした横ドラッグは page-flip の
   *   stopMove が距離不足で snap-back することがあるため intercept し、左→右ドラッグ
   *   = 前ページ / 右→左ドラッグ = 次ページ を必ず完了させる。
   *
   * リンク / ボタン上のタップには関与しない (リンク遷移を妨げない)。
   */
  useEffect(() => {
    const el = bookContainerRef.current;
    if (el == null) return;

    const TAP_MAX_MOVE = 24; // これ以下の移動量はタップ扱い (px)
    const SYNTHETIC_MOUSE_GUARD_MS = 700; // touch 後に発火する合成 mouse を無視する猶予
    const LIB_SWIPE_TIMEOUT = 250; // ライブラリの swipeTimeout に合わせる
    const DRAG_FLIP_MIN = 40; // 横ドラッグでページをめくる最低横移動量 (px)
    const SWIPE_CHROME_MIN = 40; // 縦スワイプで chrome を開閉する最低縦移動量 (px)

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

      // --- タップ: 左半分 = 前ページ / 右半分 = 次ページ ---
      if (!movedBeyondTap) {
        // ページ内のリンク / ボタン上のタップには関与しない
        if ((target as HTMLElement).closest?.("a, button") != null) return;
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0) return;
        const api = flipBookRef.current?.pageFlip();
        // page-flip 標準の click-flip は userStop ラップで抑止済み。end イベントは
        // 握り潰さないので touchPoint / isUserTouch のクリーンアップはそのまま走る。
        if (x - rect.left < rect.width / 2) api?.flipPrev();
        else api?.flipNext();
        return;
      }

      // マウスのドラッグは page-flip 標準に任せる (以降は touch 専用)。
      if (!isTouchGesture) return;

      // --- 縦スワイプ: UI chrome の表示 / 非表示 ---
      // 下スワイプ (dy > 0) = 表示、上スワイプ (dy < 0) = 非表示。
      // page-flip は縦スワイプでは fold しないので、握り潰さず通知だけ行う。
      if (Math.abs(dy) > Math.abs(dx)) {
        if (Math.abs(dy) >= SWIPE_CHROME_MIN) {
          onChromeVisibilityChangeRef.current?.(dy > 0);
        }
        return;
      }

      // --- 横ドラッグ (スワイプ) でのページめくり (portrait 専用) ---
      // page-flip 本体は touchend で次の 2 経路を持つ:
      //   (a) 速いスワイプ (dt < 250ms かつ |dx| > swipeDistance) → flipNext / flipPrev
      //   (b) ゆっくりドラッグ → stopMove (pos.x <= 0 なら完了、それ以外は snap-back)
      // (a) は page-flip に任せる (dx 方向に正しくめくられる)。(b) は portrait の
      // 画面内クランプで FORWARD が完了しないので、ここで intercept し、左右どちらの
      // ドラッグも必ず完了させる (左→右 = 前ページ / 右→左 = 次ページ)。
      if (orientation !== "portrait") return;
      if (dt < LIB_SWIPE_TIMEOUT) return; // 速いスワイプは page-flip 標準に任せる
      // 横移動が小さすぎる場合は page-flip 標準 (snap-back) に任せる
      if (Math.abs(dx) < DRAG_FLIP_MIN) return;

      e.stopImmediatePropagation();
      const api = flipBookRef.current?.pageFlip();
      if (api == null) return;

      // page-flip が fold 中 (calc あり) なら、その fold をそのまま完了側へ動かす。
      // stopMove の「完了」分岐と同じ animateFlippingTo 呼び出しで、calc が方向
      // (FORWARD / BACK) を保持しているため 1 つの呼び出しで両方向を完了できる。
      // public な flipNext / flipPrev は角の初期位置からやり直すため使わない。
      const fc = api.flipController;
      if (fc?.calc != null) {
        try {
          const pos = fc.calc.getPosition();
          const rect = fc.getBoundsRect();
          const corner = fc.calc.getCorner();
          const yEnd = corner === "bottom" ? rect.height : 0;
          fc.animateFlippingTo(pos, { x: -rect.pageWidth, y: yEnd }, true);
          return;
        } catch {
          // ライブラリ内部実装が変わった場合は public API にフォールバック
        }
      }

      // fold していない (calc なし) 場合は、ドラッグ方向に応じて明示的にめくる。
      // 左→右ドラッグ (dx > 0) = 前ページ、右→左ドラッグ (dx < 0) = 次ページ。
      if (dx > 0) api.flipPrev();
      else api.flipNext();
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
                // 領域サイズが変わったら key 貼り替えで本体を作り直し、新しい
                // width/height で正しい寸法に描き直す (props の後更新は無視されるため)。
                key={`${bookSize.w}x${bookSize.h}`}
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
