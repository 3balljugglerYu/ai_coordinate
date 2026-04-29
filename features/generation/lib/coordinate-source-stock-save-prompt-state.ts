import { readCoordinateStockSavePromptDismissed } from "./form-preferences";

export interface CoordinateSourceStockSavePromptBatch {
  file: File;
  jobIds: string[];
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
const listeners = new Set<StateChangeListener>();

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
}

export function showCoordinateSourceStockSavePrompt(
  batch: CoordinateSourceStockSavePromptBatch
): void {
  if (readCoordinateStockSavePromptDismissed()) {
    currentState = {
      pending: false,
      batch: null,
      coordinateNavDot: false,
    };
    emitChange();
    return;
  }

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
