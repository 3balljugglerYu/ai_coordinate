"use client";

import { createContext, useContext, useState } from "react";

interface GenerationStateContextValue {
  isGenerating: boolean;
  generatingCount: number;
  completedCount: number;
  setIsGenerating: (v: boolean) => void;
  setGeneratingCount: (v: number) => void;
  setCompletedCount: (v: number | ((prev: number) => number)) => void;
}

const GenerationStateContext = createContext<GenerationStateContextValue | null>(
  null
);

export function GenerationStateProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingCount, setGeneratingCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);

  return (
    <GenerationStateContext.Provider
      value={{
        isGenerating,
        generatingCount,
        completedCount,
        setIsGenerating,
        setGeneratingCount,
        setCompletedCount,
      }}
    >
      {children}
    </GenerationStateContext.Provider>
  );
}

export function useGenerationState() {
  const ctx = useContext(GenerationStateContext);
  if (!ctx) {
    return null;
  }
  return ctx;
}
