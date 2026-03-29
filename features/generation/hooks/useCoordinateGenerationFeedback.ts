"use client";

import { useEffect, useMemo, useReducer, useState } from "react";

const STATUS_ROTATION_MS = 3200;
const TYPING_INTERVAL_MS = 28;

export type CoordinateGenerationFeedbackPhase =
  | "idle"
  | "running"
  | "completing";

function pickNextRandomIndex(previousIndex: number, count: number): number {
  if (count <= 1) {
    return 0;
  }

  let nextIndex = previousIndex;
  while (nextIndex === previousIndex) {
    nextIndex = Math.floor(Math.random() * count);
  }
  return nextIndex;
}

function pickInitialIndex(count: number): number {
  if (count <= 1) {
    return 0;
  }

  return Math.floor(Math.random() * count);
}

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);

    return () => {
      mediaQuery.removeEventListener("change", updatePreference);
    };
  }, []);

  return prefersReducedMotion;
}

type FeedbackState = {
  hintIndex: number;
  messageIndex: number;
  typedLength: number;
};

type FeedbackAction =
  | {
      type: "reset";
      hintCount: number;
      phase: CoordinateGenerationFeedbackPhase;
      messageCount: number;
    }
  | {
      type: "rotate";
      hintCount: number;
      messageCount: number;
    }
  | {
      type: "typeTick";
      maxLength: number;
    };

function createFeedbackState({
  hintCount,
  phase,
  messageCount,
}: {
  hintCount: number;
  phase: CoordinateGenerationFeedbackPhase;
  messageCount: number;
}): FeedbackState {
  if (phase === "idle") {
    return {
      hintIndex: 0,
      messageIndex: 0,
      typedLength: 0,
    };
  }

  return {
    hintIndex: pickInitialIndex(hintCount),
    messageIndex: pickInitialIndex(messageCount),
    typedLength: 0,
  };
}

function feedbackReducer(
  state: FeedbackState,
  action: FeedbackAction
): FeedbackState {
  switch (action.type) {
    case "reset":
      return createFeedbackState(action);
    case "rotate":
      return {
        hintIndex: pickNextRandomIndex(state.hintIndex, action.hintCount),
        messageIndex: pickNextRandomIndex(
          state.messageIndex,
          action.messageCount
        ),
        typedLength: 0,
      };
    case "typeTick":
      return {
        ...state,
        typedLength: Math.min(state.typedLength + 1, action.maxLength),
      };
    default:
      return state;
  }
}

export function useCoordinateGenerationFeedback(
  phase: CoordinateGenerationFeedbackPhase,
  stageCopy: {
    messages: readonly string[];
    hints: readonly string[];
  }
) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const safeMessages = useMemo(
    () => (stageCopy.messages.length > 0 ? stageCopy.messages : [""]),
    [stageCopy.messages]
  );
  const safeHints = useMemo(
    () => (stageCopy.hints.length > 0 ? stageCopy.hints : [""]),
    [stageCopy.hints]
  );
  const [state, dispatch] = useReducer(
    feedbackReducer,
    {
      hintCount: safeHints.length,
      phase,
      messageCount: safeMessages.length,
    },
    createFeedbackState
  );

  useEffect(() => {
    dispatch({
      type: "reset",
      hintCount: safeHints.length,
      phase,
      messageCount: safeMessages.length,
    });
  }, [phase, safeHints.length, safeMessages.length, stageCopy]);

  useEffect(() => {
    if (phase !== "running") {
      return;
    }

    const intervalId = window.setInterval(() => {
      dispatch({
        type: "rotate",
        hintCount: safeHints.length,
        messageCount: safeMessages.length,
      });
    }, STATUS_ROTATION_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [phase, safeHints.length, safeMessages.length]);

  useEffect(() => {
    if (phase !== "running") {
      return;
    }

    const activeMessage = safeMessages[state.messageIndex] ?? "";
    let characterIndex = 0;
    const intervalId = window.setInterval(() => {
      characterIndex += 1;
      dispatch({
        type: "typeTick",
        maxLength: activeMessage.length,
      });
      if (characterIndex >= activeMessage.length) {
        window.clearInterval(intervalId);
      }
    }, TYPING_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [phase, prefersReducedMotion, safeMessages, state.messageIndex]);

  const activeMessage = phase === "idle" ? "" : safeMessages[state.messageIndex] ?? "";
  const displayedMessage = phase === "idle"
    ? ""
    : phase === "completing" || prefersReducedMotion
      ? activeMessage
      : activeMessage.slice(0, state.typedLength);

  return {
    activeMessage,
    displayedMessage,
    activeHint: phase === "idle" ? "" : safeHints[state.hintIndex] ?? "",
    prefersReducedMotion,
  };
}
