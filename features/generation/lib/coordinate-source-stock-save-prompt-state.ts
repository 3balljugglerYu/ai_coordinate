import { readCoordinateStockSavePromptDismissed } from "./form-preferences";

export interface CoordinateSourceStockSavePromptBatch {
  file: File;
  jobIds: string[];
}

export interface CoordinateSourceStockSavePromptShowOptions {
  /**
   * ダイアログが閉じられた（保存・スキップ・他要因）後に呼ばれるコールバック。
   * pending source image batch を後始末する用途で使う。
   */
  onSettled?: () => void;
}

interface CoordinateSourceStockSavePromptState {
  pending: boolean;
  batch: CoordinateSourceStockSavePromptBatch | null;
  coordinateNavDot: boolean;
}

type StateChangeListener = (
  state: CoordinateSourceStockSavePromptState
) => void;
type PendingChangeListener = (pending: boolean) => void;

let currentState: CoordinateSourceStockSavePromptState = {
  pending: false,
  batch: null,
  coordinateNavDot: false,
};
let currentOnSettled: (() => void) | null = null;
const listeners = new Set<StateChangeListener>();

function consumeOnSettled(): void {
  if (currentOnSettled) {
    const cb = currentOnSettled;
    currentOnSettled = null;
    try {
      cb();
    } catch (error) {
      console.error("[StockSavePrompt] onSettled callback failed:", error);
    }
  }
}

function getSnapshot(): CoordinateSourceStockSavePromptState {
  return {
    pending: currentState.pending,
    batch: currentState.batch,
    coordinateNavDot: currentState.coordinateNavDot,
  };
}

function emitChange(): void {
  const snapshot = getSnapshot();
  listeners.forEach((listener) => listener(snapshot));
}

export function getCoordinateSourceStockSavePromptPending(): boolean {
  return currentState.pending;
}

export function getCoordinateSourceStockSavePromptDot(): boolean {
  return currentState.coordinateNavDot;
}

export function getCoordinateSourceStockSavePromptState(): CoordinateSourceStockSavePromptState {
  return getSnapshot();
}

export function setCoordinateSourceStockSavePromptPending(
  pending: boolean
): void {
  if (currentState.pending === pending && !currentState.batch) {
    return;
  }

  currentState = {
    ...currentState,
    pending,
    batch: pending ? currentState.batch : null,
  };
  emitChange();
  if (!pending) {
    consumeOnSettled();
  }
}

export function showCoordinateSourceStockSavePrompt(
  batch: CoordinateSourceStockSavePromptBatch,
  options: CoordinateSourceStockSavePromptShowOptions = {}
): void {
  if (readCoordinateStockSavePromptDismissed()) {
    currentState = {
      pending: false,
      batch: null,
      coordinateNavDot: false,
    };
    emitChange();
    if (options.onSettled) {
      try {
        options.onSettled();
      } catch (error) {
        console.error("[StockSavePrompt] onSettled callback failed:", error);
      }
    }
    return;
  }

  // 既に別 batch が表示中だった場合、新しい onSettled で上書きする前に古い callback を呼ぶ。
  consumeOnSettled();
  currentOnSettled = options.onSettled ?? null;

  currentState = {
    pending: true,
    batch,
    coordinateNavDot: currentState.coordinateNavDot,
  };
  emitChange();
}

export function clearCoordinateSourceStockSavePrompt({
  clearDot = false,
}: { clearDot?: boolean } = {}): void {
  if (!currentState.pending && !currentState.batch && !clearDot) {
    return;
  }

  currentState = {
    ...currentState,
    pending: false,
    batch: null,
    coordinateNavDot: clearDot ? false : currentState.coordinateNavDot,
  };
  emitChange();
  consumeOnSettled();
}

export function markCoordinateSourceStockSavePromptDot(): void {
  if (currentState.coordinateNavDot) {
    return;
  }

  currentState = {
    ...currentState,
    coordinateNavDot: true,
  };
  emitChange();
}

export function clearCoordinateSourceStockSavePromptDot(): void {
  if (!currentState.coordinateNavDot) {
    return;
  }

  currentState = {
    ...currentState,
    coordinateNavDot: false,
  };
  emitChange();
}

export function clearCoordinateSourceStockSavePromptIfLocalOnly(): void {
  if (currentState.batch) {
    return;
  }
  setCoordinateSourceStockSavePromptPending(false);
}

export function subscribeCoordinateSourceStockSavePromptState(
  listener: StateChangeListener
): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function subscribeCoordinateSourceStockSavePromptPending(
  listener: PendingChangeListener
): () => void {
  return subscribeCoordinateSourceStockSavePromptState((state) => {
    listener(state.pending);
  });
}

export function subscribeCoordinateSourceStockSavePromptDot(
  listener: PendingChangeListener
): () => void {
  return subscribeCoordinateSourceStockSavePromptState((state) => {
    listener(state.coordinateNavDot);
  });
}
