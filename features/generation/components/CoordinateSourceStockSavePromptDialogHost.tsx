"use client";

import { useEffect, useState } from "react";
import { SaveSourceImageToStockDialog } from "./SaveSourceImageToStockDialog";
import {
  clearCoordinateSourceStockSavePrompt,
  getCoordinateSourceStockSavePromptState,
  subscribeCoordinateSourceStockSavePromptState,
} from "../lib/coordinate-source-stock-save-prompt-state";
import {
  writePreferredImageSourceType,
  writePreferredSelectedStockId,
} from "../lib/form-preferences";

export function CoordinateSourceStockSavePromptDialogHost() {
  const [state, setState] = useState(getCoordinateSourceStockSavePromptState);

  useEffect(() => {
    return subscribeCoordinateSourceStockSavePromptState(setState);
  }, []);

  if (!state.batch) {
    return null;
  }

  return (
    <SaveSourceImageToStockDialog
      open={state.pending}
      onOpenChange={(open) => {
        if (!open) {
          clearCoordinateSourceStockSavePrompt();
        }
      }}
      originalFile={state.batch.file}
      jobIds={state.batch.jobIds}
      onSaveStart={() => {
        // 保存開始時にページ最上部までスクロールし、ストックタブと
        // タブ上の赤丸（保存後に立つ）がユーザーの視野に入るようにする。
        if (typeof window === "undefined") return;
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
      }}
      onSaved={(stockId) => {
        // ナビバー / サイドバーの赤丸（coordinateNavDot）は意図的に立てない。
        // このダイアログはコーディネート画面でのみ表示されるため、ユーザーは
        // 既にコーディネート画面に居る。ストックタブの赤丸（source_image_stocks
        // の created_at と profiles.coordinate_stocks_tab_seen_at の比較で立つ）
        // のみで十分。
        writePreferredImageSourceType("stock");
        writePreferredSelectedStockId(stockId);
      }}
    />
  );
}
