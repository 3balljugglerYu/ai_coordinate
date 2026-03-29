"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { GeneratedImageData } from "../types";

interface GenerationStateContextValue {
  isGenerating: boolean;
  totalCount: number;
  generatingCount: number;
  completedCount: number;
  previewImages: GeneratedImageData[];
  setIsGenerating: (v: boolean) => void;
  setTotalCount: (v: number) => void;
  setGeneratingCount: (v: number) => void;
  setCompletedCount: (v: number | ((prev: number) => number)) => void;
  upsertPreviewImage: (image: GeneratedImageData) => void;
  removePreviewImage: (jobId: string) => void;
  clearPreviewImages: () => void;
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
  const [totalCount, setTotalCount] = useState(0);
  const [generatingCount, setGeneratingCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [previewImages, setPreviewImages] = useState<GeneratedImageData[]>([]);

  const upsertPreviewImage = useCallback((image: GeneratedImageData) => {
    setPreviewImages((previous) => {
      const nextGalleryKey = image.galleryKey ?? image.id;
      const currentIndex = previous.findIndex(
        (item) => (item.galleryKey ?? item.id) === nextGalleryKey
      );

      if (currentIndex === -1) {
        return [image, ...previous];
      }

      const current = previous[currentIndex];
      if (
        current.id === image.id &&
        current.url === image.url &&
        current.is_posted === image.is_posted &&
        current.isPreview === image.isPreview
      ) {
        return previous;
      }

      const next = [...previous];
      next[currentIndex] = image;
      return next;
    });
  }, []);

  const removePreviewImage = useCallback((jobId: string) => {
    setPreviewImages((previous) =>
      previous.filter((image) => image.jobId !== jobId)
    );
  }, []);

  const clearPreviewImages = useCallback(() => {
    setPreviewImages([]);
  }, []);

  const value = useMemo(
    () => ({
      isGenerating,
      totalCount,
      generatingCount,
      completedCount,
      previewImages,
      setIsGenerating,
      setTotalCount,
      setGeneratingCount,
      setCompletedCount,
      upsertPreviewImage,
      removePreviewImage,
      clearPreviewImages,
    }),
    [
      clearPreviewImages,
      completedCount,
      generatingCount,
      isGenerating,
      previewImages,
      removePreviewImage,
      totalCount,
      upsertPreviewImage,
    ]
  );

  return (
    <GenerationStateContext.Provider
      value={value}
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
