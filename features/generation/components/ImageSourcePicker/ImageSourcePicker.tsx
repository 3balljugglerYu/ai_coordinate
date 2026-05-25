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
   * (アップロード済みのプレビューや選択中ストックの image_url) を渡す。null の
   * ときはプレースホルダ。ユーザーがタイルをタップすると、そのタイルの画像が
   * 内部プレビュー状態として優先表示される。
   */
  currentPreviewUrl?: string | null;
  /** プレビュー画像の alt テキスト。 */
  currentPreviewAlt?: string;
}

const MOBILE_QUERY = "(max-width: 767px)";

/**
 * モバイルボトムシートのスナップポイント (画面高さに対する比率)。
 *
 * vaul は snap 値を `window.innerHeight` 基準で換算するため、iOS Safari の
 * アドレスバー表示中は「大きな viewport」を基準にしてしまい、最大 snap に
 * すると header (タイトル + 決定ボタン) がアドレスバー裏に隠れて操作不能に
 * なる。そこで最大は 0.9 に留め、上部 10vh ≈ 60〜90px を安全領域として確保する。
 *
 * - 0.5: 半開き状態。下にドラッグして縮めたいときの止め位置。
 * - 0.9: 初期表示。preview + tab + grid を最大限見せる「ほぼ全画面」状態。
 */
const MOBILE_SNAP_POINTS: number[] = [0.5, 0.95];
const INITIAL_SNAP_POINT = MOBILE_SNAP_POINTS[1];

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
  // 現在のスナップ位置。open のたびに初期スナップ (0.55) にリセットする。
  const [activeSnapPoint, setActiveSnapPoint] = useState<
    number | string | null
  >(INITIAL_SNAP_POINT);
  // タップされてプレビュー中のアイテム。決定ボタン押下まで親には反映しない。
  const [previewed, setPreviewed] = useState<PreviewedSelection | null>(null);
  // 決定ボタンが多重押しされないようにする。
  const [isConfirming, setIsConfirming] = useState(false);
  // プレビュー (top sheet) の展開状態。ハンドルバーを上にドラッグで閉じ、
  // 下にドラッグまたはタイル選択で開く。
  const [previewExpanded, setPreviewExpanded] = useState(true);

  useEffect(() => {
    if (open) {
      setActiveSnapPoint(INITIAL_SNAP_POINT);
      setPreviewed(null);
      setIsConfirming(false);
      setPreviewExpanded(true);
    }
  }, [open]);

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

  // タイル選択時:
  // - プレビュー画像を更新
  // - top sheet が閉じていれば自動で開く (ユーザーが選んだ画像をすぐ確認できる)
  // - drawer の snap 位置は維持する (95% 展開中にタップしても下に戻らない)
  const handleTileGenerated = useCallback((item: GeneratedItem) => {
    setPreviewed({ kind: "generated", item });
    setPreviewExpanded(true);
  }, []);
  const handleTileStock = useCallback((stock: SourceImageStock) => {
    setPreviewed({ kind: "stock", stock });
    setPreviewExpanded(true);
  }, []);

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
  }, [
    previewed,
    isConfirming,
    disabled,
    onSelectGenerated,
    onSelectStock,
  ]);

  const confirmDisabled = !previewed || disabled || isConfirming;

  // top sheet (preview) のドラッグ開閉:
  // - 下方向 16px 超のドラッグで「開く」
  // - 上方向 16px 超のドラッグで「閉じる」
  // - ドラッグ距離が閾値未満なら単純なタップとしてトグル
  const dragStartYRef = useRef<number | null>(null);
  const DRAG_THRESHOLD_PX = 16;
  const handlePreviewHandlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      dragStartYRef.current = event.clientY;
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [],
  );
  const handlePreviewHandlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const startY = dragStartYRef.current;
      dragStartYRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // capture が解除済みの場合は無視
      }
      if (startY === null) return;
      const delta = event.clientY - startY;
      if (delta < -DRAG_THRESHOLD_PX) {
        setPreviewExpanded(false);
      } else if (delta > DRAG_THRESHOLD_PX) {
        setPreviewExpanded(true);
      } else {
        // 閾値未満ならタップとしてトグル
        setPreviewExpanded((v) => !v);
      }
    },
    [],
  );

  /**
   * モバイル用プレビュー領域 (top sheet)。展開/閉じ状態を max-height で
   * アニメーションし、下端に開閉ハンドルを置く。
   */
  const previewTopSheet = (
    <div className="flex-shrink-0">
      <div
        className="overflow-hidden bg-white transition-[max-height] duration-300 ease-out"
        // 正方形プレビュー (width 基準) + 余白 + transition の最大値。
        // 60vh は実際のサイズではなく上限の安全側 cap。
        // 内側の aspect-square w-full max-w-[420px] が実サイズを決める。
        style={{ maxHeight: previewExpanded ? "60vh" : 0 }}
      >
        <div className="px-4 pb-2 pt-2">
          {previewSourceUrl ? (
            // 正方形コンテナ + bg-black + object-contain:
            // - 縦長画像: 上下フィット、左右に黒帯
            // - 横長画像: 左右フィット、上下に黒帯
            // - 正方形画像: ぴったり収まる
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
          )}
        </div>
      </div>
      {/* 開閉ハンドル: 上にドラッグで閉じる / 下にドラッグまたはタップで開く */}
      <button
        type="button"
        data-vaul-no-drag
        aria-label={previewExpanded ? t("sheetTitle") : t("sheetTitle")}
        aria-expanded={previewExpanded}
        onPointerDown={handlePreviewHandlePointerDown}
        onPointerUp={handlePreviewHandlePointerUp}
        className="group flex w-full cursor-grab touch-none items-center justify-center py-2 active:cursor-grabbing"
      >
        <span className="block h-1.5 w-12 rounded-full bg-gray-300 transition-colors group-hover:bg-gray-400" />
      </button>
    </div>
  );

  // PC モーダル用プレビュー (open/close 制御なし、常時正方形 + 黒背景 + 内接フィット)
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

  // モバイル: vaul Drawer (スナップポイント付きネイティブ風ボトムシート)
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
            // iOS Safari の動的アドレスバー込みで「現在表示中の viewport」を使う:
            // - 100vh はアドレスバー込みの最大値で、バー表示中はその分だけ
            //   drawer が画面上端を超えてしまい header が押せなくなる。
            // - 100dvh はバーの表示/非表示に追従するので、snap 0.95 でも
            //   header (タイトル + 決定ボタン) が必ず可視範囲に入る。
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

            {/* 折りたたみ可能なプレビュー (top sheet)。下端のハンドルを
                上にドラッグで閉じ、下にドラッグまたはタップで開く。 */}
            {previewTopSheet}

            {/* タブとグリッドはピッカー下部に固定し、グリッドのみが内部
                スクロールする。preview を畳めばグリッドが見える領域が増え、
                preview を開けばすぐ確認できる。 */}
            <Tabs
              value={activeTab}
              onValueChange={(v) => onTabChange(v as PickerTabId)}
              className="flex flex-1 flex-col"
              style={{ minHeight: 0 }}
            >
              <div data-vaul-no-drag className="px-4 pb-2">
                {tabsList}
              </div>
              <div
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
