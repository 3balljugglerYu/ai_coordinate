"use client";

import { useEffect, useMemo, useState } from "react";

const STATUS_ROTATION_MS = 3200;
const TYPING_INTERVAL_MS = 28;
const LONG_WAIT_THRESHOLD_MS = 20000;
const INITIAL_PROGRESS = 6;

export type GenerationFeedbackPhase = "idle" | "running" | "completing";

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

function calculatePseudoProgress(elapsedMs: number): number {
  if (elapsedMs <= 0) {
    return INITIAL_PROGRESS;
  }

  if (elapsedMs < 6000) {
    const phaseProgress = elapsedMs / 6000;
    return INITIAL_PROGRESS + (64 - INITIAL_PROGRESS) * (1 - (1 - phaseProgress) ** 2);
  }

  if (elapsedMs < 15000) {
    const phaseProgress = (elapsedMs - 6000) / 9000;
    return 64 + (88 - 64) * (1 - (1 - phaseProgress) ** 2);
  }

  if (elapsedMs < 30000) {
    const phaseProgress = (elapsedMs - 15000) / 15000;
    return 88 + (94 - 88) * phaseProgress;
  }

  return 94;
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

export function useGenerationFeedback(
  phase: GenerationFeedbackPhase,
  messages: readonly string[],
  completionMessage: string
): {
  activeMessage: string;
  displayedMessage: string;
  progress: number;
  isLongWait: boolean;
  prefersReducedMotion: boolean;
} {
  const safeMessages = useMemo(
    () => (messages.length > 0 ? messages : [""]),
    [messages]
  );
  const isGenerating = phase !== "idle";
  const isCompleting = phase === "completing";
  const isRunning = phase === "running";
  const prefersReducedMotion = usePrefersReducedMotion();
  const [messageIndex, setMessageIndex] = useState(0);
  const [displayedMessage, setDisplayedMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [isLongWait, setIsLongWait] = useState(false);

  useEffect(() => {
    if (phase === "idle") {
      setMessageIndex(0);
      setDisplayedMessage("");
      setProgress(0);
      setIsLongWait(false);
      return;
    }

    if (phase === "completing") {
      setProgress(100);
      setIsLongWait(false);
      setDisplayedMessage(completionMessage);
      return;
    }

    setMessageIndex(0);
    setProgress(INITIAL_PROGRESS);
    setIsLongWait(false);

    const startTime = Date.now();
    const intervalId = window.setInterval(() => {
      const elapsedMs = Date.now() - startTime;
      setProgress((previous) =>
        Math.max(previous, calculatePseudoProgress(elapsedMs))
      );
      setIsLongWait(elapsedMs >= LONG_WAIT_THRESHOLD_MS);
    }, 160);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [completionMessage, phase]);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setMessageIndex((previous) =>
        pickNextRandomIndex(previous, safeMessages.length)
      );
    }, STATUS_ROTATION_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isRunning, safeMessages.length]);

  useEffect(() => {
    if (!isGenerating) {
      return;
    }

    if (isCompleting) {
      setDisplayedMessage(completionMessage);
      return;
    }

    const activeMessage = safeMessages[messageIndex] ?? "";
    if (prefersReducedMotion) {
      setDisplayedMessage(activeMessage);
      return;
    }

    setDisplayedMessage("");
    let characterIndex = 0;

    const intervalId = window.setInterval(() => {
      characterIndex += 1;
      setDisplayedMessage(activeMessage.slice(0, characterIndex));

      if (characterIndex >= activeMessage.length) {
        window.clearInterval(intervalId);
      }
    }, TYPING_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    completionMessage,
    isCompleting,
    isGenerating,
    messageIndex,
    prefersReducedMotion,
    safeMessages,
  ]);

  return {
    activeMessage: isCompleting
      ? completionMessage
      : safeMessages[messageIndex] ?? "",
    displayedMessage,
    progress,
    isLongWait,
    prefersReducedMotion,
  };
}
