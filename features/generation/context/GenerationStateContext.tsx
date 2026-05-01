"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { GeneratedImageData } from "../types";

interface PendingSourceImageEntry {
  file: File;
  batchId: string;
  resultImageUrls: string[];
  promptShown: boolean;
}

export interface PendingSourceImageBatch {
  file: File;
  jobIds: string[];
  promptShown: boolean;
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
   * 生成完了後に DB 由来の確定画像へ置き換わり、画像側から jobId が落ちても
   * result URL から pending File を取り出せるようにする。
   */
  consumePendingSourceImageBatchByResultUrl: (
    resultImageUrl: string
  ) => PendingSourceImageBatch | null;
  /**
   * 渡された jobId が属するバッチ全体を read-only で取得する（map から消費しない）。
   * 3 秒タイマー満了時の表示条件確認に使う。
   */
  getPendingSourceImageBatch: (jobId: string) => PendingSourceImageBatch | null;
  /**
   * 渡された jobId が属するバッチ内の全 entry の promptShown を true にする。
   * ダイアログ表示確定時に呼び、同一 batch での二重表示を防ぐ。
   */
  markSourceImageBatchPromptShown: (jobId: string) => void;
  /**
   * 成功した jobId と確定画像URLを紐づける。
   */
  bindPendingSourceImageResult: (
    jobId: string,
    resultImageUrl: string,
    resultIndex?: number
  ) => void;
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

const pendingSourceImageMap = new Map<string, PendingSourceImageEntry>();
const pendingSourceImageJobIdByResultUrl = new Map<string, string>();

function collectBatchByJobId(
  jobId: string
): { file: File; batchId: string; jobIds: string[]; promptShown: boolean } | null {
  const entry = pendingSourceImageMap.get(jobId);
  if (!entry) return null;

  const { file, batchId } = entry;
  let promptShown = false;
  const jobIds: string[] = [];
  pendingSourceImageMap.forEach((value, key) => {
    if (value.batchId === batchId) {
      jobIds.push(key);
      if (value.promptShown) {
        promptShown = true;
      }
    }
  });

  return { file, batchId, jobIds, promptShown };
}

function consumePendingSourceImageBatchByJobId(
  jobId: string
): PendingSourceImageBatch | null {
  const batch = collectBatchByJobId(jobId);
  if (!batch) return null;

  batch.jobIds.forEach((id) => {
    const current = pendingSourceImageMap.get(id);
    if (current) {
      current.resultImageUrls.forEach((resultImageUrl) => {
        pendingSourceImageJobIdByResultUrl.delete(resultImageUrl);
      });
    }
    pendingSourceImageMap.delete(id);
  });

  return {
    file: batch.file,
    jobIds: batch.jobIds,
    promptShown: batch.promptShown,
  };
}

function findExistingBatchIdForFile(file: File): string | null {
  for (const entry of pendingSourceImageMap.values()) {
    if (entry.file === file) {
      return entry.batchId;
    }
  }
  return null;
}

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

  const registerPendingSourceImage = useCallback(
    (jobIds: string[], file: File) => {
      if (jobIds.length === 0) return;
      const existingBatchId = findExistingBatchIdForFile(file);
      const batchId =
        existingBatchId ??
        `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      jobIds.forEach((jobId) => {
        if (pendingSourceImageMap.has(jobId)) return;
        pendingSourceImageMap.set(jobId, {
          file,
          batchId,
          resultImageUrls: [],
          promptShown: false,
        });
      });
    },
    []
  );

  const consumePendingSourceImageBatch = useCallback(
    (jobId: string): PendingSourceImageBatch | null => {
      return consumePendingSourceImageBatchByJobId(jobId);
    },
    []
  );

  const consumePendingSourceImageBatchByResultUrl = useCallback(
    (resultImageUrl: string): PendingSourceImageBatch | null => {
      const jobId =
        pendingSourceImageJobIdByResultUrl.get(resultImageUrl) ??
        Array.from(pendingSourceImageMap.entries()).find(
          ([, entry]) => entry.resultImageUrls.includes(resultImageUrl)
        )?.[0];

      if (!jobId) return null;
      return consumePendingSourceImageBatchByJobId(jobId);
    },
    []
  );

  const bindPendingSourceImageResult = useCallback(
    (jobId: string, resultImageUrl: string, resultIndex?: number) => {
      const entry = pendingSourceImageMap.get(jobId);
      if (!entry) return;

      if (entry.resultImageUrls.includes(resultImageUrl)) {
        pendingSourceImageJobIdByResultUrl.set(resultImageUrl, jobId);
        return;
      }

      if (
        typeof resultIndex === "number" &&
        Number.isInteger(resultIndex) &&
        resultIndex >= 0 &&
        entry.resultImageUrls[resultIndex]
      ) {
        pendingSourceImageJobIdByResultUrl.delete(
          entry.resultImageUrls[resultIndex]
        );
        entry.resultImageUrls[resultIndex] = resultImageUrl;
      } else {
        entry.resultImageUrls.push(resultImageUrl);
      }

      pendingSourceImageJobIdByResultUrl.set(resultImageUrl, jobId);
    },
    []
  );

  const dropPendingSourceImageJob = useCallback((jobId: string) => {
    const entry = pendingSourceImageMap.get(jobId);
    if (entry) {
      entry.resultImageUrls.forEach((resultImageUrl) => {
        pendingSourceImageJobIdByResultUrl.delete(resultImageUrl);
      });
    }
    pendingSourceImageMap.delete(jobId);
  }, []);

  const getPendingSourceImageBatch = useCallback(
    (jobId: string): PendingSourceImageBatch | null => {
      const batch = collectBatchByJobId(jobId);
      if (!batch) return null;
      return {
        file: batch.file,
        jobIds: batch.jobIds,
        promptShown: batch.promptShown,
      };
    },
    []
  );

  const markSourceImageBatchPromptShown = useCallback((jobId: string) => {
    const entry = pendingSourceImageMap.get(jobId);
    if (!entry) return;
    const { batchId } = entry;
    pendingSourceImageMap.forEach((value) => {
      if (value.batchId === batchId) {
        value.promptShown = true;
      }
    });
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
      consumePendingSourceImageBatchByResultUrl,
      getPendingSourceImageBatch,
      markSourceImageBatchPromptShown,
      bindPendingSourceImageResult,
      dropPendingSourceImageJob,
      requestOpenStockTab,
      openStockTabRequestId,
    }),
    [
      clearPreviewImages,
      completedCount,
      bindPendingSourceImageResult,
      consumePendingSourceImageBatch,
      consumePendingSourceImageBatchByResultUrl,
      dropPendingSourceImageJob,
      generatingCount,
      getPendingSourceImageBatch,
      isGenerating,
      markSourceImageBatchPromptShown,
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
