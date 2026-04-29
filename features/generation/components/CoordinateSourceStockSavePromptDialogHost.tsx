"use client";

import { useEffect, useState } from "react";
import { SaveSourceImageToStockDialog } from "./SaveSourceImageToStockDialog";
import {
  clearCoordinateSourceStockSavePrompt,
  getCoordinateSourceStockSavePromptState,
  markCoordinateSourceStockSavePromptDot,
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
      onSaved={(stockId) => {
        markCoordinateSourceStockSavePromptDot();
        writePreferredImageSourceType("stock");
        writePreferredSelectedStockId(stockId);
      }}
    />
  );
}
