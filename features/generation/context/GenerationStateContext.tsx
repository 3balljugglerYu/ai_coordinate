"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { GeneratedImageData } from "../types";

interface PendingSourceImageEntry {
  file: File;
  batchId: string;
}

export interface PendingSourceImageBatch {
  file: File;
  jobIds: string[];
}

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
  /**
   * 「upload 由来の元画像」を生成 jobId と紐づけて in-memory 保持する。
   * SaveSourceImageToStockDialog がストック保存時に再利用する。
   */
  registerPendingSourceImage: (
    jobIds: string[],
    file: File
  ) => void;
  /**
   * 渡された jobId が属するバッチ全体（同じ File で生成された jobId 群）を返し、
   * その File を以後の close で再表示しないように消費する。該当が無ければ null。
   */
  consumePendingSourceImageBatch: (
    jobId: string
  ) => PendingSourceImageBatch | null;
  /**
   * 失敗した jobId だけを pending から除外する（成功した jobId は保存促進対象に残す）。
   */
  dropPendingSourceImageJob: (jobId: string) => void;
  /**
   * 別コンポーネントから GenerationForm のストックタブ選択を要求する。
   */
  requestOpenStockTab: () => void;
  openStockTabRequestId: number;
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
  const [openStockTabRequestId, setOpenStockTabRequestId] = useState(0);
  const pendingSourceImageMapRef = useRef<Map<string, PendingSourceImageEntry>>(
    new Map()
  );

  const registerPendingSourceImage = useCallback(
    (jobIds: string[], file: File) => {
      if (jobIds.length === 0) return;
      const batchId = `${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      jobIds.forEach((jobId) => {
        pendingSourceImageMapRef.current.set(jobId, { file, batchId });
      });
    },
    []
  );

  const consumePendingSourceImageBatch = useCallback(
    (jobId: string): PendingSourceImageBatch | null => {
      const entry = pendingSourceImageMapRef.current.get(jobId);
      if (!entry) return null;
      const { file, batchId } = entry;
      const jobIds: string[] = [];
      pendingSourceImageMapRef.current.forEach((value, key) => {
        if (value.batchId === batchId) {
          jobIds.push(key);
        }
      });
      jobIds.forEach((id) => pendingSourceImageMapRef.current.delete(id));
      return { file, jobIds };
    },
    []
  );

  const dropPendingSourceImageJob = useCallback((jobId: string) => {
    pendingSourceImageMapRef.current.delete(jobId);
  }, []);

  const requestOpenStockTab = useCallback(() => {
    setOpenStockTabRequestId((current) => current + 1);
  }, []);

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
      registerPendingSourceImage,
      consumePendingSourceImageBatch,
      dropPendingSourceImageJob,
      requestOpenStockTab,
      openStockTabRequestId,
    }),
    [
      clearPreviewImages,
      completedCount,
      consumePendingSourceImageBatch,
      dropPendingSourceImageJob,
      generatingCount,
      isGenerating,
      previewImages,
      registerPendingSourceImage,
      removePreviewImage,
      requestOpenStockTab,
      openStockTabRequestId,
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
