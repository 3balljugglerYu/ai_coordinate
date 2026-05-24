"use client";

import { useCallback, useState } from "react";

export type PickerTabId = "generated" | "stock";

export interface UseImageSourcePickerOptions {
  /** 初期タブ。既定: "generated". */
  defaultTab?: PickerTabId;
  /** タブが切り替わった時に呼ばれる。"stock" タブをアクティブにした瞬間の既読化等に使う。 */
  onTabChange?: (tab: PickerTabId) => void;
}

export function useImageSourcePicker(options: UseImageSourcePickerOptions = {}) {
  const { defaultTab = "generated", onTabChange } = options;
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTabState] = useState<PickerTabId>(defaultTab);

  const setActiveTab = useCallback(
    (tab: PickerTabId) => {
      setActiveTabState(tab);
      onTabChange?.(tab);
    },
    [onTabChange],
  );

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
  };
}
