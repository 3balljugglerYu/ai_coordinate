"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { track } from "@vercel/analytics/react";
import { GenerationForm } from "./GenerationForm";
import { GenerationStatusCard } from "./GenerationStatusCard";
import {
  generateImageAsync,
  getGenerationStatus,
  getInProgressJobs,
  pollGenerationStatus,
  type AsyncGenerationStatus,
} from "../lib/async-api";
import { fetchPercoinBalance } from "@/features/credits/lib/api";
import { isPercoinInsufficientError } from "@/features/credits/constants";
import { getPercoinPurchaseUrl } from "@/features/credits/lib/urls";
import { getPercoinCost } from "../lib/model-config";
import { useToast } from "@/components/ui/use-toast";
import {
  getMaxGenerationCount,
  type SubscriptionPlan,
} from "@/features/subscription/subscription-config";
import { TUTORIAL_STORAGE_KEYS } from "@/features/tutorial/types";
import { useGenerationState } from "../context/GenerationStateContext";
import {
  buildCoordinatePreparingCopy,
  buildCoordinateStageCopy,
} from "../lib/coordinate-stage-copy";
import {
  useCoordinateGenerationFeedback,
  type CoordinateGenerationFeedbackPhase,
} from "../hooks/useCoordinateGenerationFeedback";
import { summarizeJobProgress } from "../lib/job-progress";
import type { ImageJobProcessingStage } from "../lib/job-types";
import type { GeneratedImageData } from "../types";
import { submitGuestCoordinateGeneration } from "../lib/coordinate-guest-api";
import { GuestResultPreview } from "./GuestResultPreview";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { useCurrentUrlForRedirect } from "@/lib/build-current-url";

interface GenerationFormContainerProps {
  subscriptionPlan: SubscriptionPlan;
  /**
   * 認証状態。"guest" のときはゲスト sync ルートに切り替え、結果は
   * `GuestResultPreview` に in-memory で表示する。既定は "authenticated"。
   */
  authState?: "guest" | "authenticated";
  /**
   * ロックモデル選択や「保存するにはログイン」CTA から呼ばれる。AuthModal を開く想定。
   */
  onRequestSignIn?: () => void;
}

type TrackedGenerationJobStatus = Pick<
  AsyncGenerationStatus,
  "status" | "processingStage"
>;

const FALLBACK_PROGRESS_PERCENT = 0;
const RESULT_REVEAL_DELAY_MS = 5000;
const PREPARING_PROGRESS_PERCENT = 10;
const PREPARING_PROGRESS_TRANSITION_MS = 3000;
const DEFAULT_POLLING_INTERVAL_MS = 1200;
const FAST_POLLING_INTERVAL_MS = 400;
const SLOW_POLLING_INTERVAL_MS = 1600;
const COORDINATE_PROGRESS_TRANSITION_MS: Record<
  ImageJobProcessingStage,
  number
> = {
  queued: 3000,
  processing: 600,
  charging: 500,
  generating: 25000,
  uploading: 1200,
  persisting: 800,
  completed: 1000,
  failed: 1000,
};
type BrowserTimerId = number;

function createPreviewImage(jobId: string, imageUrl: string): GeneratedImageData {
  return {
    id: `preview:${jobId}`,
    galleryKey: `preview:${jobId}`,
    jobId,
    url: imageUrl,
    is_posted: false,
    isPreview: true,
  };
}

function getStatusPollingIntervalMs(status: AsyncGenerationStatus): number {
  if (status.previewImageUrl || status.processingStage === "persisting") {
    return FAST_POLLING_INTERVAL_MS;
  }

  if (
    status.processingStage === "charging" ||
    status.processingStage === "uploading"
  ) {
    return 800;
  }

  if (status.processingStage === "queued") {
    return SLOW_POLLING_INTERVAL_MS;
  }

  return DEFAULT_POLLING_INTERVAL_MS;
}

function appendUniqueErrorMessage(
  previousMessage: string | null,
  nextMessage: string
): string {
  if (!previousMessage) {
    return nextMessage;
  }

  const previousParts = previousMessage
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (previousParts.includes(nextMessage)) {
    return previousMessage;
  }

  return `${previousMessage}; ${nextMessage}`;
}

/**
 * クライアントコンポーネント: GenerationFormとその状態管理
 * Suspenseの外に配置して即座に表示される
 * 非同期画像生成APIを使用
 */
export function GenerationFormContainer({
  subscriptionPlan,
  authState = "authenticated",
  onRequestSignIn,
}: GenerationFormContainerProps) {
  const t = useTranslations("coordinate");
  const creditsT = useTranslations("credits");
  const router = useRouter();
  const { toast } = useToast();
  const ctx = useGenerationState();
  const isGuest = authState === "guest";
  const [guestResult, setGuestResult] = useState<{
    url: string;
    mimeType: string;
  } | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const currentUrl = useCurrentUrlForRedirect();
  const handleRequestSignIn = () => {
    if (onRequestSignIn) {
      onRequestSignIn();
    } else {
      setShowAuthModal(true);
    }
  };
  const [localIsGenerating, setLocalIsGenerating] = useState(false);
  const [localTotalCount, setLocalTotalCount] = useState(0);
  const [, setLocalGeneratingCount] = useState(0);
  const [localCompletedCount, setLocalCompletedCount] = useState(0);
  const [, setLocalPreviewImages] = useState<
    GeneratedImageData[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [jobStatuses, setJobStatuses] = useState<
    Record<string, TrackedGenerationJobStatus>
  >({});
  const [feedbackPhase, setFeedbackPhase] =
    useState<CoordinateGenerationFeedbackPhase>("idle");

  const isGenerating = ctx ? ctx.isGenerating : localIsGenerating;
  const totalCount = ctx ? ctx.totalCount : localTotalCount;
  const completedCount = ctx ? ctx.completedCount : localCompletedCount;
  const setIsGenerating = ctx ? ctx.setIsGenerating : setLocalIsGenerating;
  const setTotalCount = ctx ? ctx.setTotalCount : setLocalTotalCount;
  const setGeneratingCount = ctx
    ? ctx.setGeneratingCount
    : setLocalGeneratingCount;
  const setCompletedCount = ctx
    ? ctx.setCompletedCount
    : setLocalCompletedCount;
  const refreshTimeoutRef = useRef<BrowserTimerId | null>(null);
  const completionTimeoutRef = useRef<BrowserTimerId | null>(null);
  const pollingStopFunctionsRef = useRef<Set<() => void>>(new Set());
  const recoveryRequestIdRef = useRef(0);
  const asyncApiMessages = useMemo(
    () => ({
      imageLoadFailed: t("imageLoadFailed"),
      imageConvertFailed: t("imageConvertFailed"),
      imageContextUnavailable: t("imageContextUnavailable"),
      submitJobFailed: t("submitJobFailed"),
      requestIdLabel: t("requestIdLabel"),
      fetchStatusFailed: t("fetchStatusFailed"),
      fetchJobsFailed: t("fetchJobsFailed"),
      pollingStopped: t("inProgressStopped"),
      pollingTimeout: t("pollingTimeout"),
    }),
    [t]
  );
  const localUpsertPreviewImage = useCallback((image: GeneratedImageData) => {
    setLocalPreviewImages((previous) => {
      const nextGalleryKey = image.galleryKey ?? image.id;
      const currentIndex = previous.findIndex(
        (item) => (item.galleryKey ?? item.id) === nextGalleryKey
      );

      if (currentIndex === -1) {
        return [image, ...previous];
      }

      const next = [...previous];
      next[currentIndex] = image;
      return next;
    });
  }, []);
  const localRemovePreviewImage = useCallback((jobId: string) => {
    setLocalPreviewImages((previous) =>
      previous.filter((image) => image.jobId !== jobId)
    );
  }, []);
  const localClearPreviewImages = useCallback(() => {
    setLocalPreviewImages([]);
  }, []);
  const previewImageActions = useMemo(
    () => ({
      upsertPreviewImage: ctx?.upsertPreviewImage ?? localUpsertPreviewImage,
      removePreviewImage: ctx?.removePreviewImage ?? localRemovePreviewImage,
      clearPreviewImages: ctx?.clearPreviewImages ?? localClearPreviewImages,
    }),
    [
      ctx,
      localClearPreviewImages,
      localRemovePreviewImage,
      localUpsertPreviewImage,
    ]
  );
  const { upsertPreviewImage, removePreviewImage, clearPreviewImages } =
    previewImageActions;

  const setProgressCounts = useCallback(
    (nextTotalCount: number, nextCompletedCount: number) => {
      setTotalCount(nextTotalCount);
      setCompletedCount(nextCompletedCount);
      setGeneratingCount(Math.max(nextTotalCount - nextCompletedCount, 0));
    },
    [setCompletedCount, setGeneratingCount, setTotalCount]
  );

  const syncPreviewFromStatus = useCallback(
    (status: AsyncGenerationStatus) => {
      const previewUrl = status.previewImageUrl ?? status.resultImageUrl;

      if (status.status === "failed" || !previewUrl) {
        removePreviewImage(status.id);
        return;
      }

      upsertPreviewImage(createPreviewImage(status.id, previewUrl));
    },
    [removePreviewImage, upsertPreviewImage]
  );

  const clearCompletionTimeout = useCallback(() => {
    if (completionTimeoutRef.current) {
      window.clearTimeout(completionTimeoutRef.current);
      completionTimeoutRef.current = null;
    }
  }, []);

  const startCompletionReveal = useCallback(() => {
    clearCompletionTimeout();
    setFeedbackPhase("completing");
    completionTimeoutRef.current = window.setTimeout(() => {
      completionTimeoutRef.current = null;
      setFeedbackPhase("idle");
    }, RESULT_REVEAL_DELAY_MS);
  }, [clearCompletionTimeout]);

  const resetGenerationState = useCallback(() => {
    clearCompletionTimeout();
    setIsGenerating(false);
    setProgressCounts(0, 0);
    setJobStatuses({});
    clearPreviewImages();
    setFeedbackPhase("idle");
  }, [
    clearCompletionTimeout,
    clearPreviewImages,
    setIsGenerating,
    setProgressCounts,
  ]);

  const updateTrackedJob = useCallback(
    (jobId: string, status: TrackedGenerationJobStatus) => {
      setJobStatuses((previous) => {
        const nextProcessingStage = status.processingStage ?? null;
        const current = previous[jobId];
        if (
          current &&
          current.status === status.status &&
          current.processingStage === nextProcessingStage
        ) {
          return previous;
        }

        return {
          ...previous,
          [jobId]: {
            status: status.status,
            processingStage: nextProcessingStage,
          },
        };
      });
    },
    []
  );

  const scheduleCoordinateRefresh = useCallback(
    (shouldInvalidateCache: boolean, delayMs = 500) => {
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
      }

      refreshTimeoutRef.current = window.setTimeout(() => {
        void (async () => {
          if (shouldInvalidateCache) {
            try {
              await fetch("/api/revalidate/coordinate", { method: "POST" });
            } catch {
              // 無効化失敗時も refresh は継続する
            }
          }
          startTransition(() => {
            router.refresh();
          });
        })();
      }, delayMs);
    },
    [router]
  );

  const formatPartialFailureMessage = useCallback(
    (errorMessages: string[], failedCount: number, nextTotalCount: number) => {
      const uniqueErrorMessages = Array.from(new Set(errorMessages));

      const formatErrorSummary = (messages: string[]): string => {
        if (messages.length === 0) {
          return "";
        }
        if (messages.length === 1) {
          const message = messages[0];
          return message.length > 100
            ? `${message.substring(0, 100)}...`
            : message;
        }

        const messageCounts = new Map<string, number>();
        messages.forEach((message) => {
          messageCounts.set(message, (messageCounts.get(message) || 0) + 1);
        });
        const sortedMessages = Array.from(messageCounts.entries()).toSorted(
          (a, b) => b[1] - a[1]
        );
        const [mostCommonMessage, mostCommonCount] = sortedMessages[0];

        if (mostCommonCount === messages.length) {
          return mostCommonMessage.length > 100
            ? `${mostCommonMessage.substring(0, 100)}...`
            : mostCommonMessage;
        }

        const summary =
          mostCommonMessage.length > 80
            ? `${mostCommonMessage.substring(0, 80)}...`
            : mostCommonMessage;
        return `${summary} (${t("additionalErrorKinds", {
          count: messages.length - 1,
        })})`;
      };

      const errorSummary = formatErrorSummary(uniqueErrorMessages);

      return errorSummary
        ? t("partialGenerationFailedWithSummary", {
            failed: failedCount,
            total: nextTotalCount,
            summary: errorSummary,
          })
        : t("partialGenerationFailed", {
            failed: failedCount,
            total: nextTotalCount,
          });
    },
    [t]
  );

  const progressSummary = useMemo(
    () => summarizeJobProgress(Object.values(jobStatuses)),
    [jobStatuses]
  );
  const effectiveTotalCount =
    totalCount > 0 ? totalCount : progressSummary.totalCount;
  const effectiveCompletedCount =
    effectiveTotalCount > 0 ? completedCount : progressSummary.completedCount;
  const progressPercent =
    progressSummary.totalCount > 0
      ? progressSummary.progressPercent
      : effectiveTotalCount > 0
        ? Math.max(
            FALLBACK_PROGRESS_PERCENT,
            Math.round((effectiveCompletedCount / effectiveTotalCount) * 100)
          )
        : 0;
  const representativeStage =
    progressSummary.totalCount > 0
      ? progressSummary.representativeStage
      : "queued";
  const coordinateStageCopy = useMemo(() => buildCoordinateStageCopy(t), [t]);
  const coordinatePreparingCopy = useMemo(
    () => buildCoordinatePreparingCopy(t),
    [t]
  );
  const isPreparingSubmission =
    feedbackPhase === "running" &&
    effectiveTotalCount > 0 &&
    progressSummary.totalCount === 0;
  const statusCardStage =
    feedbackPhase === "completing" ? "completed" : representativeStage;
  const {
    activeMessage,
    displayedMessage,
    activeHint,
    prefersReducedMotion,
  } = useCoordinateGenerationFeedback(
    feedbackPhase,
    isPreparingSubmission
      ? coordinatePreparingCopy
      : coordinateStageCopy[statusCardStage]
  );
  const isStatusCardVisible = feedbackPhase !== "idle";
  const isFormBusy = isGenerating || feedbackPhase === "completing";
  const displayedProgressPercent =
    feedbackPhase === "completing"
      ? 100
      : isPreparingSubmission
        ? PREPARING_PROGRESS_PERCENT
        : progressPercent;
  const progressTransitionDurationMs =
    isPreparingSubmission
      ? PREPARING_PROGRESS_TRANSITION_MS
      : COORDINATE_PROGRESS_TRANSITION_MS[statusCardStage];
  const generationStatusTitle =
    feedbackPhase === "completing"
      ? t("generationCompletedTitle")
      : t("generationProgressTitle", {
          completed: effectiveCompletedCount,
          total: effectiveTotalCount,
        });

  useEffect(() => {
    // ゲストは async ジョブを持たないため復旧不要
    if (isGuest) {
      return;
    }
    const recoveryRequestId = ++recoveryRequestIdRef.current;
    let isCancelled = false;

    const checkInProgressJobs = async () => {
      const isStale = () =>
        isCancelled || recoveryRequestIdRef.current !== recoveryRequestId;

      try {
        const inProgressJobs = await getInProgressJobs(false, asyncApiMessages);

        if (isStale()) {
          return;
        }

        if (inProgressJobs.length === 0) {
          resetGenerationState();
          return;
        }

        const nextTotalCount = inProgressJobs.length;
        const completedJobIds = new Set<string>();

        setIsGenerating(true);
        setFeedbackPhase("running");
        setError(null);
        setProgressCounts(nextTotalCount, 0);
        setJobStatuses(
          Object.fromEntries(
            inProgressJobs.map((job) => [
              job.id,
              {
                status: job.status,
                processingStage: job.processingStage ?? null,
              },
            ])
          )
        );

        const pollPromises = inProgressJobs.map(async (job) => {
          if (isStale()) {
            return null;
          }

          updateTrackedJob(job.id, {
            status: job.status,
            processingStage: job.processingStage ?? null,
          });

          const markTerminalJob = (
            status: AsyncGenerationStatus,
            options?: { appendError?: boolean }
          ) => {
            updateTrackedJob(status.id, status);
            syncPreviewFromStatus(status);

            if (!completedJobIds.has(status.id)) {
              completedJobIds.add(status.id);
              setProgressCounts(nextTotalCount, completedJobIds.size);
            }

            if (status.status === "failed" && options?.appendError !== false) {
              const nextMessage =
                status.errorMessage || t("generationFailedGeneric");
              setError((previous) =>
                appendUniqueErrorMessage(previous, nextMessage)
              );
            }
          };

          try {
            const currentStatus = await getGenerationStatus(job.id, asyncApiMessages);
            if (isStale()) {
              return null;
            }
            if (
              currentStatus.status === "succeeded" ||
              currentStatus.status === "failed"
            ) {
              markTerminalJob(currentStatus);
              return currentStatus;
            }

            updateTrackedJob(currentStatus.id, currentStatus);
            syncPreviewFromStatus(currentStatus);
          } catch (initialStatusError) {
            console.error("Failed to get initial job status:", initialStatusError);
          }

          const { promise, stop } = pollGenerationStatus(job.id, {
            interval: getStatusPollingIntervalMs,
            timeout: 300000,
            messages: asyncApiMessages,
            onStatusUpdate: (status) => {
              updateTrackedJob(status.id, status);
              syncPreviewFromStatus(status);
              if (status.status === "succeeded" || status.status === "failed") {
                markTerminalJob(status);
              }
            },
          });

          pollingStopFunctionsRef.current.add(stop);

          try {
            const status = await promise;
            if (isStale()) {
              return status;
            }
            markTerminalJob(status);
            return status;
          } catch (pollError) {
            if (isStale()) {
              return null;
            }
            const errorMessage =
              pollError instanceof Error ? pollError.message : "";

            if (errorMessage === asyncApiMessages.pollingStopped) {
              return {
                id: job.id,
                status: "queued" as const,
                processingStage: "queued" as const,
                previewImageUrl: null,
                resultImageUrl: null,
                errorMessage: null,
              };
            }

            if (!completedJobIds.has(job.id)) {
              completedJobIds.add(job.id);
              setProgressCounts(nextTotalCount, completedJobIds.size);
            }

            setError((previous) =>
              appendUniqueErrorMessage(
                previous,
                errorMessage || t("generationFailedGeneric")
              )
            );
            throw pollError;
          } finally {
            pollingStopFunctionsRef.current.delete(stop);
          }
        });

        const results = await Promise.allSettled(pollPromises);
        const succeededJobs = results.filter(
          (result) =>
            result.status === "fulfilled" && result.value?.status === "succeeded"
        ).length;

        if (isStale()) {
          return;
        }

        const failedJobs = results.filter((result) => {
          if (result.status !== "rejected") {
            return false;
          }

          const errorMessage = result.reason?.message || "";
          return errorMessage !== asyncApiMessages.pollingStopped;
        });

        if (failedJobs.length > 0 && failedJobs.length < nextTotalCount) {
          const summaryMessage = formatPartialFailureMessage(
            failedJobs
              .map((result) =>
                result.status === "rejected"
                  ? result.reason?.message || t("generationFailedGeneric")
                  : null
              )
              .filter((message): message is string => message !== null),
            failedJobs.length,
            nextTotalCount
          );

          setError((previous) =>
            appendUniqueErrorMessage(previous, summaryMessage)
          );
        }

        if (
          typeof sessionStorage !== "undefined" &&
          sessionStorage.getItem(TUTORIAL_STORAGE_KEYS.IN_PROGRESS) === "true"
        ) {
          document.dispatchEvent(
            new CustomEvent("tutorial:generation-complete", { bubbles: true })
          );
        }

        setIsGenerating(false);
        setGeneratingCount(0);
        if (succeededJobs > 0) {
          startCompletionReveal();
        } else {
          setFeedbackPhase("idle");
        }
        window.dispatchEvent(new CustomEvent("generation-complete"));

        scheduleCoordinateRefresh(
          true,
          succeededJobs > 0 ? RESULT_REVEAL_DELAY_MS : 0
        );
      } catch (inProgressError) {
        if (isCancelled) {
          return;
        }
        console.error("Failed to check in-progress jobs:", inProgressError);
        resetGenerationState();
      }
    };

    void checkInProgressJobs();

    return () => {
      isCancelled = true;
    };
  }, [
    asyncApiMessages,
    formatPartialFailureMessage,
    isGuest,
    resetGenerationState,
    router,
    scheduleCoordinateRefresh,
    setGeneratingCount,
    setIsGenerating,
    setProgressCounts,
    syncPreviewFromStatus,
    startCompletionReveal,
    t,
    updateTrackedJob,
  ]);

  useEffect(() => {
    const stopFunctions = pollingStopFunctionsRef.current;
    return () => {
      stopFunctions.forEach((stop) => stop());
      stopFunctions.clear();
      clearCompletionTimeout();
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    };
  }, [clearCompletionTimeout]);

  const handleGenerate = async (data: {
    prompt: string;
    sourceImage?: File;
    sourceImageStockId?: string;
    sourceImageType?: import("../types").SourceImageType;
    backgroundMode: import("../types").BackgroundMode;
    count: number;
    model: import("../types").GeminiModel;
    generationType?: import("../types").GenerationType;
  }) => {
    const showGenerationErrorToast = (message: string) => {
      toast({
        variant: "destructive",
        title: t("generationFailedTitle"),
        description: <span className="whitespace-pre-line">{message}</span>,
      });
    };

    // ゲストは sync ルートで完結する。in-memory に結果を保持し、リロードで消える (UCL-017)。
    if (isGuest) {
      if (!data.sourceImage) {
        showGenerationErrorToast(t("imageContextUnavailable"));
        return;
      }
      setError(null);
      setGuestResult(null);
      setIsGenerating(true);
      setFeedbackPhase("running");
      try {
        const result = await submitGuestCoordinateGeneration({
          prompt: data.prompt,
          sourceImage: data.sourceImage,
          sourceImageType: data.sourceImageType,
          backgroundMode: data.backgroundMode,
          generationType: data.generationType ?? "coordinate",
          model: data.model,
        });
        if (result.kind === "success") {
          setGuestResult({ url: result.imageDataUrl, mimeType: result.mimeType });
          setFeedbackPhase("idle");
        } else {
          // signupCta が立っていれば「保存はログイン」CTA で代替できるので、
          // メッセージはそのまま表示しトーストでも通知。
          setError(result.message);
          if (result.errorCode !== "GUEST_RATE_LIMIT_DAILY") {
            showGenerationErrorToast(result.message);
          }
          setFeedbackPhase("idle");
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : t("guestSubmitFailed");
        setError(message);
        showGenerationErrorToast(message);
        setFeedbackPhase("idle");
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    recoveryRequestIdRef.current += 1;
    const allowedCount = Math.min(
      data.count,
      getMaxGenerationCount(subscriptionPlan)
    );

    setIsGenerating(true);
    clearCompletionTimeout();
    clearPreviewImages();
    setFeedbackPhase("running");
    setError(null);
    setJobStatuses({});
    setProgressCounts(allowedCount, 0);

    pollingStopFunctionsRef.current.forEach((stop) => stop());
    pollingStopFunctionsRef.current.clear();
    if (refreshTimeoutRef.current) {
      window.clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }

    try {
      const percoinCost = getPercoinCost(data.model);
      const requiredPercoins = allowedCount * percoinCost;
      const { balance } = await fetchPercoinBalance({
        fetchBalanceFailed: creditsT("fetchBalanceFailed"),
      });

      if (balance < requiredPercoins) {
        setError(
          t("insufficientBalance", {
            requiredPercoins,
            balance,
          })
        );
        resetGenerationState();
        return;
      }

      const jobIds: string[] = [];
      for (let index = 0; index < allowedCount; index += 1) {
        try {
          const response = await generateImageAsync(
            {
              prompt: data.prompt,
              sourceImage: data.sourceImage,
              sourceImageStockId: data.sourceImageStockId,
              sourceImageType: data.sourceImageType,
              backgroundMode: data.backgroundMode,
              generationType: data.generationType || "coordinate",
              model: data.model,
            },
            asyncApiMessages
          );

          jobIds.push(response.jobId);
          updateTrackedJob(response.jobId, {
            status: response.status as AsyncGenerationStatus["status"],
            processingStage: "queued",
          });
        } catch (submitError) {
          if (jobIds.length === 0) {
            throw submitError;
          }

          const errorMessage =
            submitError instanceof Error
              ? submitError.message
              : t("submitJobFailed");
          setError((previous) =>
            appendUniqueErrorMessage(previous, errorMessage)
          );
          showGenerationErrorToast(errorMessage);
          break;
        }
      }

      if (jobIds.length === 0) {
        throw new Error(t("submitJobFailed"));
      }

      const nextTotalCount = jobIds.length;
      const completedJobIds = new Set<string>();
      setProgressCounts(nextTotalCount, 0);

      const pollPromises = jobIds.map(async (jobId) => {
        const markTerminalJob = (
          status: AsyncGenerationStatus,
          options?: { appendError?: boolean }
        ) => {
          updateTrackedJob(jobId, status);
          syncPreviewFromStatus(status);

          if (!completedJobIds.has(jobId)) {
            completedJobIds.add(jobId);
            setProgressCounts(nextTotalCount, completedJobIds.size);
          }

          if (status.status === "failed" && options?.appendError !== false) {
            const nextMessage =
              status.errorMessage || t("generationFailedGeneric");
            setError((previous) =>
              appendUniqueErrorMessage(previous, nextMessage)
            );
          }
        };

        const { promise, stop } = pollGenerationStatus(jobId, {
          interval: getStatusPollingIntervalMs,
          timeout: 300000,
          messages: asyncApiMessages,
          onStatusUpdate: (status) => {
            updateTrackedJob(jobId, status);
              syncPreviewFromStatus(status);
              if (status.status === "succeeded" || status.status === "failed") {
                markTerminalJob(status);
              }
            },
          });

        pollingStopFunctionsRef.current.add(stop);

        try {
          const status = await promise;
          if (status.status === "failed") {
            markTerminalJob(status);
            throw new Error(status.errorMessage || t("generationFailedGeneric"));
          }

          markTerminalJob(status, { appendError: false });
          return status;
        } catch (pollError) {
          const errorMessage =
            pollError instanceof Error ? pollError.message : "";

          if (errorMessage === asyncApiMessages.pollingStopped) {
            return {
              id: jobId,
              status: "queued" as const,
              processingStage: "queued" as const,
              previewImageUrl: null,
              resultImageUrl: null,
              errorMessage: null,
            };
          }

          if (!completedJobIds.has(jobId)) {
            completedJobIds.add(jobId);
            setProgressCounts(nextTotalCount, completedJobIds.size);
          }

          throw pollError;
        } finally {
          pollingStopFunctionsRef.current.delete(stop);
        }
      });

      const results = await Promise.allSettled(pollPromises);
      const succeededJobs = results.filter(
        (result) =>
          result.status === "fulfilled" && result.value?.status === "succeeded"
      ).length;
      const failedJobs = results.filter((result) => {
        if (result.status !== "rejected") {
          return false;
        }

        const errorMessage = result.reason?.message || "";
        return errorMessage !== asyncApiMessages.pollingStopped;
      });

      if (failedJobs.length > 0) {
        const errorMessages = failedJobs
          .map((result) =>
            result.status === "rejected"
              ? result.reason?.message || t("generationFailedGeneric")
              : null
          )
          .filter((message): message is string => message !== null);

        if (failedJobs.length === nextTotalCount) {
          throw new Error(errorMessages[0] || t("generationFailedGeneric"));
        }

        const summaryMessage = formatPartialFailureMessage(
          errorMessages,
          failedJobs.length,
          nextTotalCount
        );
        setError(summaryMessage);
        showGenerationErrorToast(summaryMessage);
      }

      window.dispatchEvent(new CustomEvent("generation-complete"));
      setIsGenerating(false);
      setGeneratingCount(0);
      if (succeededJobs > 0) {
        startCompletionReveal();
      } else {
        setFeedbackPhase("idle");
      }
      scheduleCoordinateRefresh(
        true,
        succeededJobs > 0 ? RESULT_REVEAL_DELAY_MS : 0
      );
      track("coordinate_generation_complete", {
        count: nextTotalCount,
        succeeded: nextTotalCount - failedJobs.length,
      });
    } catch (generationError) {
      const errorMessage =
        generationError instanceof Error
          ? generationError.message
          : t("generationFailedGeneric");
      track("coordinate_generation_failed", {
        error: errorMessage.substring(0, 100),
      });
      setError(errorMessage);
      showGenerationErrorToast(errorMessage);
      resetGenerationState();
      return;
    } finally {
      if (
        typeof sessionStorage !== "undefined" &&
        sessionStorage.getItem(TUTORIAL_STORAGE_KEYS.IN_PROGRESS) === "true"
      ) {
        document.dispatchEvent(
          new CustomEvent("tutorial:generation-complete", { bubbles: true })
        );
      }

      pollingStopFunctionsRef.current.forEach((stop) => stop());
      pollingStopFunctionsRef.current.clear();
    }
  };

  return (
    <div className="space-y-8">
      <GenerationForm
        subscriptionPlan={subscriptionPlan}
        onSubmit={handleGenerate}
        isGenerating={isFormBusy}
        authState={authState}
      />

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="whitespace-pre-line text-sm text-red-900">{error}</p>
          {isPercoinInsufficientError(error) && !isGuest ? (
            <div className="mt-3 flex justify-center lg:justify-start">
              <Link
                href={getPercoinPurchaseUrl("coordinate")}
                className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {creditsT("purchaseAction")}
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      {isGuest ? (
        <GuestResultPreview
          result={guestResult}
          onLoginCtaClick={handleRequestSignIn}
        />
      ) : null}

      {isGuest && !onRequestSignIn ? (
        <AuthModal
          open={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          redirectTo={currentUrl}
        />
      ) : null}

      {!isGuest && isStatusCardVisible ? (
        <div data-tour="tour-generating">
          <GenerationStatusCard
            title={generationStatusTitle}
            message={displayedMessage}
            liveMessage={activeMessage}
            footerText={activeHint}
            progress={displayedProgressPercent}
            progressTransitionDurationMs={progressTransitionDurationMs}
            animateFromZeroOnMount
            isComplete={feedbackPhase === "completing"}
            prefersReducedMotion={prefersReducedMotion}
          />
        </div>
      ) : null}
    </div>
  );
}
