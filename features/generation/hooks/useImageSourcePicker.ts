"use client";

import { useCallback, useEffect, useState } from "react";
import { prefetchAll } from "../lib/picker-cache";

export type PickerTabId = "generated" | "stock";

export interface UseImageSourcePickerOptions {
  /** 初期タブ。既定: "generated". */
  defaultTab?: PickerTabId;
  /** タブが切り替わった時に呼ばれる。"stock" タブをアクティブにした瞬間の既読化等に使う。 */
  onTabChange?: (tab: PickerTabId) => void;
  /**
   * hook mount 時に picker の prefetch を自動発火するか。既定: true。
   * テスト等で副作用を抑止したい場合のみ false にする。
   */
  autoPrefetch?: boolean;
}

export function useImageSourcePicker(options: UseImageSourcePickerOptions = {}) {
  const {
    defaultTab = "generated",
    onTabChange,
    autoPrefetch = true,
  } = options;
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTabState] = useState<PickerTabId>(defaultTab);

  const setActiveTab = useCallback(
    (tab: PickerTabId) => {
      setActiveTabState(tab);
      onTabChange?.(tab);
    },
    [onTabChange],
  );

  const prefetch = useCallback(() => {
    void prefetchAll();
  }, []);

  // フォームを開いた瞬間に prefetch を発火する。これによりユーザーが
  // ピッカートリガーボタンを押した時には既にデータが揃っている確率が高く、
  // 体感の初回表示が即時化される。失敗してもログのみで握り潰す。
  useEffect(() => {
    if (!autoPrefetch) return;
    prefetch();
  }, [autoPrefetch, prefetch]);

  const openPicker = useCallback(() => {
    setOpen(true);
    onTabChange?.(activeTab);
  }, [activeTab, onTabChange]);

  const closePicker = useCallback(() => setOpen(false), []);

  return {
    open,
    setOpen,
    activeTab,
    setActiveTab,
    openPicker,
    closePicker,
    /** 任意タイミングで prefetch をやり直したい時に呼ぶ。 */
    prefetch,
  };
}
