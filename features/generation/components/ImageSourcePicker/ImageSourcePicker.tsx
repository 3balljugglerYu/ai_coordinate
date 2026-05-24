"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { GeneratedImagesTab } from "./GeneratedImagesTab";
import { StockImagesTab } from "./StockImagesTab";
import type { PickerTabId } from "../../hooks/useImageSourcePicker";
import type { PickerSourceItem } from "../../types";
import type { SourceImageStock } from "../../lib/database";

type GeneratedItem = Extract<PickerSourceItem, { kind: "generated" }>;

interface ImageSourcePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab: PickerTabId;
  onTabChange: (tab: PickerTabId) => void;
  onSelectGenerated: (item: GeneratedItem) => Promise<void> | void;
  onSelectStock: (stock: SourceImageStock) => Promise<void> | void;
  /** 現在選択中のストック ID (該当タイルにリング)。 */
  selectedStockId?: string | null;
  /** ピッカー内すべての操作を無効化 (生成中など)。 */
  disabled?: boolean;
  /** 親が「生成済み」画像の fetch 中の id を渡すと該当タイルにスピナーを出す。 */
  pendingGeneratedId?: string | null;
  /** 親が「ストック」画像の fetch 中の id を渡すと該当タイルにスピナーを出す。 */
  pendingStockId?: string | null;
}

const MOBILE_QUERY = "(max-width: 767px)";

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
}: ImageSourcePickerProps) {
  const t = useTranslations("imageSourcePicker");
  const isMobile = useIsMobileViewport();

  const body = (
    <Tabs
      value={activeTab}
      onValueChange={(v) => onTabChange(v as PickerTabId)}
      className="flex flex-col gap-3"
    >
      <TabsList className="w-full">
        <TabsTrigger value="generated" className="flex-1">
          {t("tabGenerated")}
        </TabsTrigger>
        <TabsTrigger value="stock" className="flex-1">
          {t("tabStock")}
        </TabsTrigger>
      </TabsList>

      <TabsContent
        value="generated"
        className="min-h-[260px] focus-visible:outline-none"
      >
        <GeneratedImagesTab
          active={open && activeTab === "generated"}
          onSelect={onSelectGenerated}
          pendingItemId={pendingGeneratedId}
          disabled={disabled}
        />
      </TabsContent>

      <TabsContent
        value="stock"
        className="min-h-[260px] focus-visible:outline-none"
      >
        <StockImagesTab
          active={open && activeTab === "stock"}
          onSelect={onSelectStock}
          selectedStockId={selectedStockId}
          pendingStockId={pendingStockId}
          disabled={disabled}
        />
      </TabsContent>
    </Tabs>
  );

  // モバイル: ボトムシート / PC: 中央モーダル
  // 同時に両方が open になることはない (isMobile で排他)。
  return (
    <>
      <Sheet open={open && isMobile} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="max-h-[85vh] overflow-y-auto rounded-t-2xl"
        >
          <SheetHeader className="px-0 text-left">
            <SheetTitle>{t("sheetTitle")}</SheetTitle>
          </SheetHeader>
          <div className="mt-2">{body}</div>
        </SheetContent>
      </Sheet>

      <Dialog open={open && !isMobile} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("sheetTitle")}</DialogTitle>
          </DialogHeader>
          <div className="mt-1">{body}</div>
        </DialogContent>
      </Dialog>
    </>
  );
}
