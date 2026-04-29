import { readCoordinateStockSavePromptDismissed } from "./form-preferences";

export interface CoordinateSourceStockSavePromptBatch {
  file: File;
  jobIds: string[];
}

interface CoordinateSourceStockSavePromptState {
  pending: boolean;
  batch: CoordinateSourceStockSavePromptBatch | null;
}

type StateChangeListener = (
  state: CoordinateSourceStockSavePromptState
) => void;
type PendingChangeListener = (pending: boolean) => void;

let currentState: CoordinateSourceStockSavePromptState = {
  pending: false,
  batch: null,
};
const listeners = new Set<StateChangeListener>();

function getSnapshot(): CoordinateSourceStockSavePromptState {
  return {
    pending: currentState.pending,
    batch: currentState.batch,
  };
}

function emitChange(): void {
  const snapshot = getSnapshot();
  listeners.forEach((listener) => listener(snapshot));
}

export function getCoordinateSourceStockSavePromptPending(): boolean {
  return currentState.pending;
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
    pending,
    batch: pending ? currentState.batch : null,
  };
  emitChange();
}

export function showCoordinateSourceStockSavePrompt(
  batch: CoordinateSourceStockSavePromptBatch
): void {
  if (readCoordinateStockSavePromptDismissed()) {
    clearCoordinateSourceStockSavePrompt();
    return;
  }

  currentState = {
    pending: true,
    batch,
  };
  emitChange();
}

export function clearCoordinateSourceStockSavePrompt(): void {
  if (!currentState.pending && !currentState.batch) {
    return;
  }

  currentState = {
    pending: false,
    batch: null,
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
