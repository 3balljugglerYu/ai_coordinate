"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
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
        writePreferredImageSourceType("stock");
        writePreferredSelectedStockId(stockId);
      }}
      onRequestManageStocks={() => {
        clearCoordinateSourceStockSavePrompt();
        writePreferredImageSourceType("stock");
        router.push("/coordinate");
      }}
      onRequestSubscriptionPlans={clearCoordinateSourceStockSavePrompt}
    />
  );
}
