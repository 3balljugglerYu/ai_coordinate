"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Drawer } from "vaul";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { GeneratedImagesTab } from "./GeneratedImagesTab";
import { StockImagesTab } from "./StockImagesTab";
import type { PickerTabId } from "../../hooks/useImageSourcePicker";
import type { PickerSourceItem } from "../../types";
import type { SourceImageStock } from "../../lib/database";

type GeneratedItem = Extract<PickerSourceItem, { kind: "generated" }>;

/** ピッカー内で「タップされてプレビュー中」のアイテムを保持する判別共用体。 */
type PreviewedSelection =
  | { kind: "generated"; item: GeneratedItem }
  | { kind: "stock"; stock: SourceImageStock };

interface ImageSourcePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab: PickerTabId;
  onTabChange: (tab: PickerTabId) => void;
  /**
   * 「決定」ボタン押下時に呼ばれる確定コールバック。
   * picker は内部でプレビュー状態を持ち、ユーザーが決定するまで親には通知しない。
   */
  onSelectGenerated: (item: GeneratedItem) => Promise<void> | void;
  onSelectStock: (stock: SourceImageStock) => Promise<void> | void;
  /** 現在親フォームに反映されているストック ID (該当タイルにマーク表示)。 */
  selectedStockId?: string | null;
  /** ピッカー内すべての操作を無効化 (生成中など)。 */
  disabled?: boolean;
  /** 親が「生成済み」画像の fetch 中の id を渡すと該当タイルにスピナーを出す。 */
  pendingGeneratedId?: string | null;
  /** 親が「ストック」画像の fetch 中の id を渡すと該当タイルにスピナーを出す。 */
  pendingStockId?: string | null;
  /**
   * 初期プレビュー表示する画像の URL。親が現在フォームに入っている画像
   * (アップロード済みのプレビューや選択中ストックの image_url) を渡す。
   */
  currentPreviewUrl?: string | null;
  /** プレビュー画像の alt テキスト。 */
  currentPreviewAlt?: string;
}

const MOBILE_QUERY = "(max-width: 767px)";

/**
 * モバイルボトムシートのスナップポイント (画面高さに対する比率)。
 *
 * - 0.5: 半開き状態。ハンドル下ドラッグで縮めたいときの止め位置。
 * - 0.95: 初期表示。preview + tab + grid を最大限見せる「ほぼ全画面」状態。
 */
const MOBILE_SNAP_POINTS: number[] = [0.5, 0.95];
const INITIAL_SNAP_POINT = MOBILE_SNAP_POINTS[1];

/**
 * preview top sheet の最大高さを「ビューポート高さの何割」とするか。
 * 50% ≈ 422px (iPhone 844px viewport)。aspect-square で width=358px の
 * preview 画像 + 余白がちょうど収まる目安。
 */
const PREVIEW_MAX_HEIGHT_RATIO = 0.5;

/**
 * タイル選択時、preview が閉じている場合にゆっくり展開するアニメ時間 (ms)。
 */
const PREVIEW_OPEN_ANIMATION_MS = 500;

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  return isMobile;
}

function getInitialPreviewMaxPx(): number {
  if (typeof window === "undefined") return 420;
  return Math.floor(window.innerHeight * PREVIEW_MAX_HEIGHT_RATIO);
}

export function ImageSourcePicker({
  open,
  onOpenChange,
  activeTab,
  onTabChange,
  onSelectGenerated,
  onSelectStock,
  selectedStockId = null,
  disabled = false,
  pendingGeneratedId = null,
  pendingStockId = null,
  currentPreviewUrl = null,
  currentPreviewAlt = "",
}: ImageSourcePickerProps) {
  const t = useTranslations("imageSourcePicker");
  const isMobile = useIsMobileViewport();
  // 現在のスナップ位置。open のたびに初期スナップにリセットする。
  const [activeSnapPoint, setActiveSnapPoint] = useState<
    number | string | null
  >(INITIAL_SNAP_POINT);
  // タップされてプレビュー中のアイテム。決定ボタン押下まで親には反映しない。
  const [previewed, setPreviewed] = useState<PreviewedSelection | null>(null);
  // 決定ボタンが多重押しされないようにする。
  const [isConfirming, setIsConfirming] = useState(false);

  // preview の高さ (px)。
  // - グリッドスクロールに比例して縮む (scrollTop に追従)
  // - タイル選択でアニメ付きで最大に戻る
  const [previewMaxPx, setPreviewMaxPx] = useState<number>(
    getInitialPreviewMaxPx,
  );
  const [previewHeight, setPreviewHeight] = useState<number>(
    getInitialPreviewMaxPx,
  );
  // アニメ中だけ CSS transition を有効にする。スクロール追従中は transition
  // を切って指の動きにピッタリ追従させる。
  const [isAnimating, setIsAnimating] = useState(false);
  const animateTimeoutRef = useRef<number | null>(null);

  // touch ハンドラから常に最新値を参照するための ref。
  // 注意: state を useEffect 経由で ref に同期すると 1 フレーム遅れ、
  // タイル選択直後のアニメ中に touchstart が走ると ref が古いままで
  // 「上ドラッグしても preview が縮まない」事象が起きる。そのため
  // ref への書き込みは setState と同タイミングで同期的に行う。
  const previewHeightRef = useRef(previewHeight);
  const previewMaxPxRef = useRef(previewMaxPx);

  const setPreviewHeightSync = useCallback((value: number) => {
    previewHeightRef.current = value;
    setPreviewHeight(value);
  }, []);
  const setPreviewMaxPxSync = useCallback((value: number) => {
    previewMaxPxRef.current = value;
    setPreviewMaxPx(value);
  }, []);

  // モバイル drawer 内のスクロール領域への参照 (touch ハンドラ用)。
  // callback ref として実装するため、useRef は単なるストレージ。
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  // touch ハンドラの cleanup 関数 (callback ref から呼ぶ)
  const detachTouchListenersRef = useRef<(() => void) | null>(null);

  // viewport サイズ変更に追随
  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateMax = () => {
      const next = Math.floor(window.innerHeight * PREVIEW_MAX_HEIGHT_RATIO);
      setPreviewMaxPxSync(next);
      setPreviewHeightSync(Math.min(previewHeightRef.current, next));
    };
    window.addEventListener("resize", updateMax);
    return () => window.removeEventListener("resize", updateMax);
  }, [setPreviewMaxPxSync, setPreviewHeightSync]);

  useEffect(() => {
    if (open) {
      setActiveSnapPoint(INITIAL_SNAP_POINT);
      setPreviewed(null);
      setIsConfirming(false);
      setPreviewHeightSync(previewMaxPx);
      setIsAnimating(false);
      if (animateTimeoutRef.current) {
        window.clearTimeout(animateTimeoutRef.current);
        animateTimeoutRef.current = null;
      }
    }
  }, [open, previewMaxPx, setPreviewHeightSync]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (animateTimeoutRef.current) {
        window.clearTimeout(animateTimeoutRef.current);
      }
    };
  }, []);

  const previewSourceUrl =
    previewed?.kind === "generated"
      ? previewed.item.imageUrl
      : previewed?.kind === "stock"
        ? previewed.stock.image_url
        : currentPreviewUrl;
  const previewAlt =
    previewed?.kind === "stock"
      ? (previewed.stock.name ?? "")
      : currentPreviewAlt;
  const previewedGeneratedId =
    previewed?.kind === "generated" ? previewed.item.id : null;
  const previewedStockId =
    previewed?.kind === "stock" ? previewed.stock.id : selectedStockId;

  /**
   * グリッド上で「シーケンシャル」な指追従ジェスチャを実装する。
   *
   * - 上ドラッグ (指を上に動かす):
   *   - preview が表示中 AND grid が scrollTop=0 のとき → 指追従で preview を縮める
   *     (preventDefault で native スクロールを抑止)
   *   - preview が 0 になったら preventDefault を解除 → 以降は native スクロール
   * - 下ドラッグ (指を下に動かす):
   *   - grid が scrollTop=0 AND preview が最大未満 → 指追従で preview を伸ばす
   *   - それ以外は native スクロールで grid を上に戻す
   *
   * touchstart/touchmove を passive: false で直接 addEventListener する
   * (React の onTouchMove は passive で preventDefault できないため)。
   *
   * callback ref で実装する理由: vaul Drawer.Content は Portal で open=true
   * のときだけ mount される。useEffect deps だと「effect が走るタイミング」と
   * 「ref が set されるタイミング」のズレで listener が貼られないケースが
   * あり得るため、ref attach のタイミングで確実に listener を貼る。
   */
  const attachScrollContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      // 既存の listener を必ず解除
      if (detachTouchListenersRef.current) {
        detachTouchListenersRef.current();
        detachTouchListenersRef.current = null;
      }
      scrollContainerRef.current = node;
      if (!node) return;

      let touchStartY = 0;
      let initialPreviewHeight = 0;
      let initialScrollTop = 0;
      // この touch シーケンス中に preview を縮める方向に動かしたか
      let didShrinkPreview = false;
      // この touch シーケンス中に preview を広げる方向に動かしたか
      let didGrowPreview = false;

      const onTouchStart = (event: TouchEvent) => {
        if (event.touches.length !== 1) return;
        touchStartY = event.touches[0].clientY;
        initialPreviewHeight = previewHeightRef.current;
        initialScrollTop = node.scrollTop;
        didShrinkPreview = false;
        didGrowPreview = false;
        // 進行中のアニメは中断 (gesture が優先)
        if (animateTimeoutRef.current) {
          window.clearTimeout(animateTimeoutRef.current);
          animateTimeoutRef.current = null;
        }
        setIsAnimating(false);
      };

      const onTouchMove = (event: TouchEvent) => {
        if (event.touches.length !== 1) return;
        const currentY = event.touches[0].clientY;
        const dragUp = touchStartY - currentY; // 正 = 上方向ドラッグ

        // 上ドラッグ: preview が残っていれば先に消費する (scrollTop は問わない)。
        // 理由: grid を途中までスクロールした状態でタイル選択し preview が開
        // いたとき、ユーザーが期待するのは「次に上ドラッグしたら preview が
        // 縮む」。scrollTop=0 を要求すると、scrollTop>0 から始まるドラッグで
        // preview が消費されず、grid だけがさらにスクロールしてしまう。
        // preview を消費中は preventDefault で grid の同時スクロールを止める。
        if (dragUp > 0 && initialPreviewHeight > 0) {
          const newHeight = Math.max(0, initialPreviewHeight - dragUp);
          setPreviewHeightSync(newHeight);
          if (newHeight < initialPreviewHeight) {
            didShrinkPreview = true;
            didGrowPreview = false;
          }
          if (newHeight > 0) {
            // まだ消費中: native scroll をブロック
            event.preventDefault();
          }
          return;
        }

        // 下ドラッグ: grid が top で preview が最大未満 → preview を伸ばす
        if (
          dragUp < 0 &&
          initialScrollTop === 0 &&
          previewHeightRef.current < previewMaxPxRef.current
        ) {
          const pullDown = -dragUp;
          const newHeight = Math.min(
            previewMaxPxRef.current,
            initialPreviewHeight + pullDown,
          );
          setPreviewHeightSync(newHeight);
          if (newHeight > initialPreviewHeight) {
            didGrowPreview = true;
            didShrinkPreview = false;
          }
          event.preventDefault();
          return;
        }
        // 他のケース (grid 既スクロール中など) は native scroll に委ねる
      };

      const onTouchEnd = () => {
        const cur = previewHeightRef.current;
        const max = previewMaxPxRef.current;
        // 中途半端な高さで指を離した場合のみ snap させる
        if (cur <= 0 || cur >= max) {
          didShrinkPreview = false;
          didGrowPreview = false;
          return;
        }
        // 上ドラッグで縮め途中 → 0 まで閉じる
        // 下ドラッグで広げ途中 → 最大まで開く
        const target = didShrinkPreview ? 0 : didGrowPreview ? max : null;
        if (target !== null) {
          setIsAnimating(true);
          setPreviewHeightSync(target);
          if (animateTimeoutRef.current) {
            window.clearTimeout(animateTimeoutRef.current);
          }
          animateTimeoutRef.current = window.setTimeout(() => {
            setIsAnimating(false);
            animateTimeoutRef.current = null;
          }, PREVIEW_OPEN_ANIMATION_MS);
        }
        didShrinkPreview = false;
        didGrowPreview = false;
      };

      node.addEventListener("touchstart", onTouchStart, { passive: false });
      node.addEventListener("touchmove", onTouchMove, { passive: false });
      node.addEventListener("touchend", onTouchEnd, { passive: true });
      node.addEventListener("touchcancel", onTouchEnd, { passive: true });
      detachTouchListenersRef.current = () => {
        node.removeEventListener("touchstart", onTouchStart);
        node.removeEventListener("touchmove", onTouchMove);
        node.removeEventListener("touchend", onTouchEnd);
        node.removeEventListener("touchcancel", onTouchEnd);
      };
    },
    [setPreviewHeightSync],
  );

  /**
   * タイル選択時:
   * - プレビュー画像を内部 state に反映 (チェックバッジ切替)
   * - preview が縮んでいる場合、最大高さまでアニメで開く
   * - グリッドのスクロール位置は変更しない (独立)
   */
  const openPreviewWithAnimation = useCallback(() => {
    setIsAnimating(true);
    setPreviewHeightSync(previewMaxPx);
    if (animateTimeoutRef.current) {
      window.clearTimeout(animateTimeoutRef.current);
    }
    animateTimeoutRef.current = window.setTimeout(() => {
      setIsAnimating(false);
      animateTimeoutRef.current = null;
    }, PREVIEW_OPEN_ANIMATION_MS);
  }, [previewMaxPx, setPreviewHeightSync]);

  const handleTileGenerated = useCallback(
    (item: GeneratedItem) => {
      setPreviewed({ kind: "generated", item });
      openPreviewWithAnimation();
    },
    [openPreviewWithAnimation],
  );

  /**
   * ボトムシート表示時のデフォルト選択。GeneratedImagesTab が初回 fetch を
   * 終えたタイミングで先頭アイテムを通知してくるので、ユーザーがまだ何も
   * 選んでいなければ自動で previewed に入れる。アニメは出さない (open 時の
   * 初期表示なので静かに表示する)。
   */
  const handleFirstGeneratedReady = useCallback((item: GeneratedItem) => {
    setPreviewed((prev) => prev ?? { kind: "generated", item });
  }, []);
  const handleTileStock = useCallback(
    (stock: SourceImageStock) => {
      setPreviewed({ kind: "stock", stock });
      openPreviewWithAnimation();
    },
    [openPreviewWithAnimation],
  );

  const handleConfirm = useCallback(async () => {
    if (!previewed || isConfirming || disabled) return;
    setIsConfirming(true);
    try {
      if (previewed.kind === "generated") {
        await onSelectGenerated(previewed.item);
      } else {
        await onSelectStock(previewed.stock);
      }
    } finally {
      setIsConfirming(false);
    }
  }, [previewed, isConfirming, disabled, onSelectGenerated, onSelectStock]);

  const confirmDisabled = !previewed || disabled || isConfirming;

  /**
   * プレビュー本体 (正方形 + bg-black + object-contain)。
   * - 縦長画像: 上下フィット、左右に黒帯
   * - 横長画像: 左右フィット、上下に黒帯
   */
  const previewImage = previewSourceUrl ? (
    <div className="mx-auto aspect-square w-full max-w-[420px] overflow-hidden rounded-md bg-black">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={previewSourceUrl}
        alt={previewAlt}
        className="h-full w-full object-contain"
      />
    </div>
  ) : (
    <div className="mx-auto flex aspect-square w-full max-w-[420px] items-center justify-center rounded-md border-2 border-dashed border-gray-300 bg-gray-50 text-xs text-gray-400">
      {t("sheetTitle")}
    </div>
  );

  // PC モーダル用プレビュー
  const previewForDialog = previewSourceUrl ? (
    <div className="mx-auto aspect-square w-full max-w-md overflow-hidden rounded-md bg-black">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={previewSourceUrl}
        alt={previewAlt}
        className="h-full w-full object-contain"
      />
    </div>
  ) : (
    <div className="mx-auto flex aspect-square w-full max-w-md items-center justify-center rounded-md border-2 border-dashed border-gray-300 bg-gray-50 text-xs text-gray-400">
      {t("sheetTitle")}
    </div>
  );

  const tabsList = (
    <TabsList className="w-full">
      <TabsTrigger value="generated" className="flex-1">
        {t("tabGenerated")}
      </TabsTrigger>
      <TabsTrigger value="stock" className="flex-1">
        {t("tabStock")}
      </TabsTrigger>
    </TabsList>
  );

  const generatedTabPanel = (
    <TabsContent
      value="generated"
      className="min-h-[260px] focus-visible:outline-none"
    >
      <GeneratedImagesTab
        active={open && activeTab === "generated"}
        onSelect={handleTileGenerated}
        pendingItemId={pendingGeneratedId}
        selectedItemId={previewedGeneratedId}
        disabled={disabled || isConfirming}
        onFirstItemReady={handleFirstGeneratedReady}
      />
    </TabsContent>
  );

  const stockTabPanel = (
    <TabsContent
      value="stock"
      className="min-h-[260px] focus-visible:outline-none"
    >
      <StockImagesTab
        active={open && activeTab === "stock"}
        onSelect={handleTileStock}
        selectedStockId={previewedStockId}
        pendingStockId={pendingStockId}
        disabled={disabled || isConfirming}
      />
    </TabsContent>
  );

  // モバイル: vaul Drawer + 独立 preview/grid (スクロール連動高さ)
  // PC: shadcn Dialog (中央モーダル)
  return (
    <>
      <Drawer.Root
        open={open && isMobile}
        onOpenChange={onOpenChange}
        snapPoints={MOBILE_SNAP_POINTS}
        activeSnapPoint={activeSnapPoint}
        setActiveSnapPoint={setActiveSnapPoint}
        fadeFromIndex={0}
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Drawer.Content
            className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl bg-white outline-none"
            style={{ height: "100dvh", maxHeight: "100dvh" }}
          >
            {/* 固定ヘッダ: ハンドル + タイトル + 決定ボタン */}
            <div className="flex-shrink-0">
              <Drawer.Handle className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-gray-300" />
              <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
                <Drawer.Title className="text-base font-semibold text-gray-900">
                  {t("sheetTitle")}
                </Drawer.Title>
                <Drawer.Description className="sr-only">
                  {t("triggerHint")}
                </Drawer.Description>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleConfirm()}
                  disabled={confirmDisabled}
                  data-vaul-no-drag
                >
                  {t("confirmAction")}
                </Button>
              </div>
            </div>

            {/* preview top sheet:
                高さはグリッドの scrollTop に連動して縮む (Instagram 風)。
                タイル選択時のみアニメで最大に戻る。 */}
            <div
              className={
                isAnimating
                  ? "flex-shrink-0 overflow-hidden bg-white transition-[height] duration-500 ease-out"
                  : "flex-shrink-0 overflow-hidden bg-white"
              }
              style={{ height: `${previewHeight}px` }}
            >
              <div className="px-4 pb-2 pt-2">{previewImage}</div>
            </div>

            {/* タブとグリッド (独立スクロール、preview とは onScroll で連動)。
                タイル選択は preview を開くだけで scrollTop は変更しない。 */}
            <Tabs
              value={activeTab}
              onValueChange={(v) => onTabChange(v as PickerTabId)}
              className="flex flex-1 flex-col"
              style={{ minHeight: 0 }}
            >
              <div data-vaul-no-drag className="px-4 pb-0.5 pt-1">
                {tabsList}
              </div>
              <div
                ref={attachScrollContainerRef}
                data-vaul-no-drag
                className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6"
                style={{ minHeight: 0 }}
              >
                {generatedTabPanel}
                {stockTabPanel}
              </div>
            </Tabs>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      <Dialog open={open && !isMobile} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("sheetTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {previewForDialog}
            <Tabs
              value={activeTab}
              onValueChange={(v) => onTabChange(v as PickerTabId)}
              className="flex flex-col gap-3"
            >
              {tabsList}
              {generatedTabPanel}
              {stockTabPanel}
            </Tabs>
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={confirmDisabled}
            >
              {t("confirmAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
