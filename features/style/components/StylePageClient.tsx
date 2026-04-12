"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { Download, Maximize2, Minimize2, Share2, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ImageUploader } from "@/features/generation/components/ImageUploader";
import { GenerationStatusCard } from "@/features/generation/components/GenerationStatusCard";
import {
  getGenerationStatus,
  pollGenerationStatus,
  type AsyncGenerationStatus,
} from "@/features/generation/lib/async-api";
import {
  buildCoordinatePreparingCopy,
  buildCoordinateStageCopy,
} from "@/features/generation/lib/coordinate-stage-copy";
import {
  useCoordinateGenerationFeedback,
  type CoordinateGenerationFeedbackPhase,
} from "@/features/generation/hooks/useCoordinateGenerationFeedback";
import {
  normalizeProcessingStage,
  summarizeJobProgress,
} from "@/features/generation/lib/job-progress";
import type { ImageJobProcessingStage } from "@/features/generation/lib/job-types";
import type { UploadedImage } from "@/features/generation/types";
import type { SourceImageType } from "@/shared/generation/prompt-core";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";
import { STYLE_GENERATION_IMAGE_SIZE, STYLE_GENERATION_MODEL } from "@/features/style/lib/constants";
import { useGenerationFeedback } from "@/features/style/hooks/useGenerationFeedback";
import { recordStyleUsageClientEvent } from "@/features/style/lib/style-usage-client";
import { StyleGenerationStatusCard } from "@/features/style/components/StyleGenerationStatusCard";
import { StylePresetPreviewCard } from "@/features/style/components/StylePresetPreviewCard";
import { PostModal } from "@/features/posts/components/PostModal";
import { fetchPercoinBalance } from "@/features/credits/lib/api";
import { getPercoinPurchaseUrl } from "@/features/credits/lib/urls";
import { getPercoinCost } from "@/features/generation/lib/model-config";
import { determineFileName } from "@/lib/utils";
import { normalizeSourceImage } from "@/features/generation/lib/normalize-source-image";

interface StylePageClientProps {
  presets: readonly StylePresetPublicSummary[];
  initialAuthState?: "authenticated" | "guest";
  initialSelectedPresetId?: string | null;
}

interface StyleErrorState {
  message: string;
  showSignupCta?: boolean;
  signupPath?: string;
}

interface StyleRateLimitStatusState {
  authState: "authenticated" | "guest";
  remainingDaily: number | null;
  showRemainingWarning: boolean;
}

interface StylePercoinBalanceState {
  balance: number | null;
  isLoading: boolean;
  error: string | null;
}

type ResultConfirmationIntent = "change" | "regenerate";
type GenerationPhase = "idle" | "running" | "completing";

const RESULT_REVEAL_DELAY_MS = 5000;
const PREPARING_PROGRESS_PERCENT = 10;
const PREPARING_PROGRESS_TRANSITION_MS = 3000;
const STYLE_PAID_GENERATION_COST = getPercoinCost(STYLE_GENERATION_MODEL);
const DEFAULT_POLLING_INTERVAL_MS = 1200;
const FAST_POLLING_INTERVAL_MS = 400;
const SLOW_POLLING_INTERVAL_MS = 1600;
const ASYNC_PROGRESS_TRANSITION_MS: Record<ImageJobProcessingStage, number> = {
  queued: 3000,
  processing: 600,
  charging: 500,
  generating: 25000,
  uploading: 1200,
  persisting: 800,
  completed: 1000,
  failed: 1000,
};

function getStyleAsyncPollingIntervalMs(status: AsyncGenerationStatus): number {
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

function resolveInitialSelectedPresetId(
  presets: readonly StylePresetPublicSummary[],
  initialSelectedPresetId?: string | null
): StylePresetPublicSummary["id"] {
  if (
    initialSelectedPresetId &&
    presets.some((preset) => preset.id === initialSelectedPresetId)
  ) {
    return initialSelectedPresetId;
  }

  return presets[0]?.id ?? "";
}

function StyleReferencePanel({
  label,
  imageSrc,
  imageAlt,
  className,
  collapsed = false,
  aspectRatio,
}: {
  label: string;
  imageSrc: string;
  imageAlt: string;
  className?: string;
  collapsed?: boolean;
  aspectRatio?: number;
}) {
  return (
    <div className={className ?? "space-y-3"}>
      <Label
        className={
          collapsed
            ? "text-xs font-medium leading-none"
            : "text-base font-medium"
        }
      >
        {label}
      </Label>
      <Card className="overflow-hidden p-0">
        <div
          className="relative bg-slate-100"
          style={{ aspectRatio: String(aspectRatio ?? 1) }}
        >
          <Image
            src={imageSrc}
            alt={imageAlt}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
            priority
          />
        </div>
      </Card>
    </div>
  );
}

function StyleResultPanel({
  title,
  placeholder,
  resultImageUrl,
  resultImageAlt,
  action,
}: {
  title: string;
  placeholder: string;
  resultImageUrl: string | null;
  resultImageAlt: string;
  action?: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
        {action ?? null}
      </div>
      <Card
        className={`overflow-hidden p-0 ${
          resultImageUrl
            ? "w-full md:w-fit md:max-w-[460px]"
            : "w-full max-w-[460px]"
        }`}
      >
        {resultImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resultImageUrl}
            alt={resultImageAlt}
            className="block w-full h-auto md:w-auto md:max-w-[460px] md:max-h-[550px]"
          />
        ) : (
          <div className="relative flex h-[320px] items-center justify-center bg-slate-100 sm:h-[420px]">
            <p className="px-4 text-center text-sm text-slate-500">
              {placeholder}
            </p>
          </div>
        )}
      </Card>
    </section>
  );
}

function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

async function fetchStyleRateLimitStatus(): Promise<StyleRateLimitStatusState | null> {
  const response = await fetch("/style/rate-limit-status", {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as
    | {
        authState?: unknown;
        remainingDaily?: unknown;
        showRemainingWarning?: unknown;
      }
    | null;

  if (
    !payload ||
    (payload.authState !== "authenticated" && payload.authState !== "guest")
  ) {
    return null;
  }

  return {
    authState: payload.authState,
    remainingDaily:
      typeof payload.remainingDaily === "number" ? payload.remainingDaily : null,
    showRemainingWarning: payload.showRemainingWarning === true,
  };
}

function StyleResultDownloadButton({
  imageUrl,
  styleId,
  label,
  ariaLabel,
  successTitle,
  successDescription,
  failedMessage,
}: {
  imageUrl: string;
  styleId: string;
  label: string;
  ariaLabel: string;
  successTitle: string;
  successDescription: string;
  failedMessage: string;
}) {
  const [isDownloading, setIsDownloading] = useState(false);
  const { toast } = useToast();

  const downloadResponse = async () => {
    const response = await fetch(imageUrl, { mode: "cors" });
    if (response.status === 401 || response.status === 403) {
      throw new Error(failedMessage);
    }

    if (!response.ok) {
      throw new Error(failedMessage);
    }

    return response;
  };

  const triggerDownload = (blob: Blob, fileName: string) => {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 100);
  };

  const handleDownload = async () => {
    if (isDownloading) {
      return;
    }

    setIsDownloading(true);
    try {
      const response = await downloadResponse();
      const blob = await response.blob();
      const mimeType =
        blob.type || response.headers.get("content-type") || "image/png";
      const fileName = determineFileName(response, imageUrl, styleId, mimeType);

      triggerDownload(blob, fileName);
      toast({
        title: successTitle,
        description: successDescription,
      });
      void recordStyleUsageClientEvent({
        eventType: "download",
        styleId,
      }).catch(() => {
        // Usage tracking must not block the successful download flow.
      });
    } catch (error) {
      console.error("Style result download error:", error);
      toast({
        title: error instanceof Error ? error.message : failedMessage,
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadMobile = async () => {
    if (isDownloading) {
      return;
    }

    setIsDownloading(true);
    try {
      const response = await downloadResponse();
      const blob = await response.blob();
      const mimeType =
        blob.type || response.headers.get("content-type") || "image/png";
      const fileName = determineFileName(response, imageUrl, styleId, mimeType);
      const file = new File([blob], fileName, { type: mimeType });

      if (
        typeof navigator !== "undefined" &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          files: [file],
          title: "Persta.AI",
        });
        void recordStyleUsageClientEvent({
          eventType: "download",
          styleId,
        }).catch(() => {
          // Usage tracking must not block the successful share flow.
        });
        return;
      }

      await handleDownload();
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (
        (error instanceof DOMException && error.name === "AbortError") ||
        message.includes("user gesture") ||
        message.includes("share request")
      ) {
        setIsDownloading(false);
        return;
      }

      console.error("Style share sheet error:", error);

      try {
        await handleDownload();
      } catch {
        // handleDownload already reports any fallback error.
      }
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        if (isMobileDevice()) {
          void handleDownloadMobile();
          return;
        }

        void handleDownload();
      }}
      disabled={isDownloading}
      className="flex h-9 items-center gap-2 rounded-full border-slate-300 px-3 text-sm font-medium text-slate-700 shadow-sm"
      aria-label={ariaLabel}
    >
      <Download className="h-4 w-4" />
      <span>{label}</span>
    </Button>
  );
}

export function StylePageClient({
  presets,
  initialAuthState,
  initialSelectedPresetId,
}: StylePageClientProps) {
  const router = useRouter();
  const t = useTranslations("style");
  const coordinateT = useTranslations("coordinate");
  const postsT = useTranslations("posts");
  const presetStripRef = useRef<HTMLDivElement | null>(null);
  const presetButtonRefs = useRef(
    new Map<StylePresetPublicSummary["id"], HTMLButtonElement>()
  );
  const [selectedPresetId, setSelectedPresetId] = useState<
    StylePresetPublicSummary["id"]
  >(() => resolveInitialSelectedPresetId(presets, initialSelectedPresetId));
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  const [sourceImageType, setSourceImageType] = useState<SourceImageType>("illustration");
  const [backgroundChange, setBackgroundChange] = useState(false);
  const [generationPhase, setGenerationPhase] = useState<GenerationPhase>("idle");
  const [resultImageUrl, setResultImageUrl] = useState<string | null>(null);
  const [queuedResultImageUrl, setQueuedResultImageUrl] = useState<string | null>(null);
  const [resultGeneratedImageId, setResultGeneratedImageId] = useState<string | null>(null);
  const [errorState, setErrorState] = useState<StyleErrorState | null>(null);
  const [rateLimitStatus, setRateLimitStatus] =
    useState<StyleRateLimitStatusState | null>(null);
  const [percoinBalanceState, setPercoinBalanceState] =
    useState<StylePercoinBalanceState>({
      balance: null,
      isLoading: false,
      error: null,
    });
  const [activeAsyncJobStatus, setActiveAsyncJobStatus] =
    useState<AsyncGenerationStatus | null>(null);
  const [rateLimitDialogMessage, setRateLimitDialogMessage] = useState<string | null>(null);
  const [isReferenceCardCollapsed, setIsReferenceCardCollapsed] = useState(false);
  const [isResultResetDialogOpen, setIsResultResetDialogOpen] = useState(false);
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [isPresetStripDragging, setIsPresetStripDragging] = useState(false);
  const [resultConfirmationIntent, setResultConfirmationIntent] =
    useState<ResultConfirmationIntent>("change");
  const pendingResultResetActionRef = useRef<null | (() => void)>(null);
  const activePollStopRef = useRef<(() => void) | null>(null);
  const hasTrackedVisitRef = useRef(false);
  const syncedSelectedPresetParamRef = useRef<string | null>(
    initialSelectedPresetId ?? null
  );
  const presetDragStartXRef = useRef(0);
  const presetDragStartScrollLeftRef = useRef(0);
  const suppressPresetClickRef = useRef(false);

  const selectedPreset =
    presets.find((preset) => preset.id === selectedPresetId) ?? presets[0] ?? null;
  const effectiveAuthState = rateLimitStatus?.authState ?? initialAuthState ?? null;
  const shouldUseAsyncGeneration = effectiveAuthState === "authenticated";
  const isGuestDailyLimitReached =
    rateLimitStatus?.remainingDaily === 0 && rateLimitStatus.authState === "guest";
  const isAuthenticatedPaidOnlyMode =
    rateLimitStatus?.remainingDaily === 0 &&
    rateLimitStatus.authState === "authenticated";
  const hasEnoughPercoins =
    typeof percoinBalanceState.balance === "number" &&
    percoinBalanceState.balance >= STYLE_PAID_GENERATION_COST;
  const shouldDisablePaidContinuation =
    isAuthenticatedPaidOnlyMode &&
    (percoinBalanceState.isLoading ||
      Boolean(percoinBalanceState.error) ||
      !hasEnoughPercoins);

  const isGenerating = generationPhase !== "idle";
  const isBackgroundChangeAvailable = Boolean(selectedPreset?.hasBackgroundPrompt);
  const isBackgroundChangeDisabled = isGenerating || !isBackgroundChangeAvailable;
  const isGenerateDisabled =
    !selectedPreset ||
    !uploadedImage ||
    isGenerating ||
    isGuestDailyLimitReached ||
    shouldDisablePaidContinuation;
  const hasGeneratedResult = Boolean(resultImageUrl);
  const resultPreviewImageUrl =
    shouldUseAsyncGeneration && isGenerating
      ? activeAsyncJobStatus?.previewImageUrl ?? null
      : null;
  const displayedResultImageUrl = resultImageUrl ?? resultPreviewImageUrl;
  const canPostGeneratedResult =
    Boolean(resultImageUrl) &&
    Boolean(resultGeneratedImageId) &&
    effectiveAuthState === "authenticated";
  const isCompletingGeneration = generationPhase === "completing";
  const selectedPresetAspectRatio = selectedPreset
    ? selectedPreset.thumbnailWidth / selectedPreset.thumbnailHeight
    : 1;
  const remainingDailyNoticeCount =
    rateLimitStatus?.showRemainingWarning &&
    typeof rateLimitStatus.remainingDaily === "number" &&
    rateLimitStatus.remainingDaily > 0
      ? rateLimitStatus.remainingDaily
      : null;
  const shouldShowDailyLimitCard =
    isGuestDailyLimitReached || isAuthenticatedPaidOnlyMode;
  const generationMessages = useMemo(
    () => [
      t("generationStatusMessage1"),
      t("generationStatusMessage2"),
      t("generationStatusMessage3"),
      t("generationStatusMessage4"),
      t("generationStatusMessage5"),
      t("generationStatusMessage6"),
      t("generationStatusMessage7"),
      t("generationStatusMessage8"),
      t("generationStatusMessage9"),
      t("generationStatusMessage10"),
      t("generationStatusMessage11"),
      t("generationStatusMessage12"),
    ],
    [t]
  );
  const guestGenerationFeedback = useGenerationFeedback(
    generationPhase,
    generationMessages,
    t("generationStatusCompleteMessage")
  );
  const asyncStageCopy = useMemo(
    () => buildCoordinateStageCopy(coordinateT),
    [coordinateT]
  );
  const asyncPreparingCopy = useMemo(
    () => buildCoordinatePreparingCopy(coordinateT),
    [coordinateT]
  );
  const asyncProgressSummary = activeAsyncJobStatus
    ? summarizeJobProgress([
        {
          status: activeAsyncJobStatus.status,
          processingStage: normalizeProcessingStage(
            activeAsyncJobStatus.status,
            activeAsyncJobStatus.processingStage
          ),
        },
      ])
    : {
        totalCount: 1,
        completedCount: 0,
        pendingCount: 1,
        representativeStage: "queued" as const,
        progressPercent: 15,
      };
  const isAsyncStatusCard = shouldUseAsyncGeneration && isGenerating;
  const asyncFeedbackPhase = generationPhase as CoordinateGenerationFeedbackPhase;
  const isPreparingAsyncSubmission =
    asyncFeedbackPhase === "running" && !activeAsyncJobStatus;
  const asyncStatusCardStage =
    asyncFeedbackPhase === "completing"
      ? "completed"
      : asyncProgressSummary.representativeStage;
  const {
    activeMessage: asyncStatusCardLiveMessage,
    displayedMessage: asyncStatusCardMessage,
    activeHint: asyncStatusCardHint,
    prefersReducedMotion: asyncStatusCardPrefersReducedMotion,
  } = useCoordinateGenerationFeedback(
    isAsyncStatusCard ? asyncFeedbackPhase : "idle",
    isPreparingAsyncSubmission
      ? asyncPreparingCopy
      : asyncStageCopy[asyncStatusCardStage]
  );
  const asyncStatusCardProgress = isCompletingGeneration
    ? 100
    : isPreparingAsyncSubmission
      ? PREPARING_PROGRESS_PERCENT
      : asyncProgressSummary.progressPercent;
  const asyncStatusCardProgressTransitionDurationMs =
    isPreparingAsyncSubmission
      ? PREPARING_PROGRESS_TRANSITION_MS
      : ASYNC_PROGRESS_TRANSITION_MS[asyncStatusCardStage];
  const guestStatusCardMessage = guestGenerationFeedback.displayedMessage;
  const guestStatusCardLiveMessage = guestGenerationFeedback.activeMessage;
  const guestStatusCardProgress = guestGenerationFeedback.progress;
  const guestStatusCardIsLongWait = guestGenerationFeedback.isLongWait;
  const guestStatusCardPrefersReducedMotion =
    guestGenerationFeedback.prefersReducedMotion;

  useEffect(() => {
    if (generationPhase !== "completing" || !queuedResultImageUrl) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setResultImageUrl(queuedResultImageUrl);
      setQueuedResultImageUrl(null);
      setGenerationPhase("idle");
    }, RESULT_REVEAL_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [generationPhase, queuedResultImageUrl]);

  useEffect(() => {
    return () => {
      activePollStopRef.current?.();
      activePollStopRef.current = null;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    void fetchStyleRateLimitStatus()
      .then((status) => {
        if (isActive && status) {
          setRateLimitStatus(status);
        }
      })
      .catch(() => {
        // Status fetch failures should not affect the page UX.
      });

    return () => {
      isActive = false;
    };
  }, []);

  const refreshPercoinBalance = async () => {
    if (effectiveAuthState !== "authenticated") {
      setPercoinBalanceState({
        balance: null,
        isLoading: false,
        error: null,
      });
      return;
    }

    setPercoinBalanceState((previous) => ({
      balance: previous.balance,
      isLoading: true,
      error: null,
    }));

    try {
      const payload = await fetchPercoinBalance({
        fetchBalanceFailed: t("percoinBalanceFetchFailed"),
      });
      setPercoinBalanceState({
        balance: payload.balance,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setPercoinBalanceState({
        balance: null,
        isLoading: false,
        error: error instanceof Error ? error.message : t("percoinBalanceFetchFailed"),
      });
    }
  };

  useEffect(() => {
    if (effectiveAuthState !== "authenticated") {
      setPercoinBalanceState({
        balance: null,
        isLoading: false,
        error: null,
      });
      return;
    }

    void refreshPercoinBalance();
  }, [effectiveAuthState, isAuthenticatedPaidOnlyMode]);

  useEffect(() => {
    if (!selectedPreset?.hasBackgroundPrompt && backgroundChange) {
      setBackgroundChange(false);
    }
  }, [backgroundChange, selectedPreset?.hasBackgroundPrompt]);

  useEffect(() => {
    if (!selectedPresetId) {
      return;
    }

    const selectedButton = presetButtonRefs.current.get(selectedPresetId);
    if (typeof selectedButton?.scrollIntoView !== "function") {
      return;
    }

    selectedButton.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [selectedPresetId]);

  useEffect(() => {
    const hasValidPresetParam =
      typeof initialSelectedPresetId === "string" &&
      presets.some((preset) => preset.id === initialSelectedPresetId);

    if (
      hasValidPresetParam &&
      syncedSelectedPresetParamRef.current !== initialSelectedPresetId
    ) {
      syncedSelectedPresetParamRef.current = initialSelectedPresetId;
      setSelectedPresetId(initialSelectedPresetId);
      return;
    }

    if (presets.some((preset) => preset.id === selectedPresetId)) {
      return;
    }

    syncedSelectedPresetParamRef.current = initialSelectedPresetId ?? null;
    setSelectedPresetId(
      resolveInitialSelectedPresetId(presets, initialSelectedPresetId)
    );
  }, [initialSelectedPresetId, presets, selectedPresetId]);

  const refreshRateLimitStatus = () => {
    void fetchStyleRateLimitStatus()
      .then((status) => {
        if (status) {
          setRateLimitStatus(status);
        }
      })
      .catch(() => {
        // Status fetch failures should not affect the page UX.
      });
  };

  const runAfterResultResetCheck = (
    action: () => void,
    intent: ResultConfirmationIntent = "change"
  ) => {
    if (!hasGeneratedResult) {
      action();
      return;
    }

    pendingResultResetActionRef.current = action;
    setResultConfirmationIntent(intent);
    setIsResultResetDialogOpen(true);
  };

  const handleResultResetDialogChange = (open: boolean) => {
    setIsResultResetDialogOpen(open);
    if (!open) {
      pendingResultResetActionRef.current = null;
    }
  };

  const handleConfirmResultReset = () => {
    const pendingAction = pendingResultResetActionRef.current;
    pendingResultResetActionRef.current = null;
    setIsResultResetDialogOpen(false);
    pendingAction?.();
  };

  const handlePresetSelect = (presetId: StylePresetPublicSummary["id"]) => {
    if (presetId === selectedPresetId) {
      return;
    }

    runAfterResultResetCheck(() => {
      setSelectedPresetId(presetId);
      setErrorState(null);
      setResultImageUrl(null);
    });
  };

  const endPresetStripDrag = () => {
    presetDragStartXRef.current = 0;
    presetDragStartScrollLeftRef.current = 0;
    setIsPresetStripDragging(false);
  };

  useEffect(() => {
    if (!isPresetStripDragging) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const strip = presetStripRef.current;
      if (!strip) {
        return;
      }

      const deltaX = event.clientX - presetDragStartXRef.current;
      if (Math.abs(deltaX) > 6) {
        suppressPresetClickRef.current = true;
      }

      strip.scrollLeft = presetDragStartScrollLeftRef.current - deltaX;
    };

    const handleMouseUp = () => {
      endPresetStripDrag();
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isPresetStripDragging]);

  const handlePresetStripMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    presetDragStartXRef.current = event.clientX;
    presetDragStartScrollLeftRef.current =
      presetStripRef.current?.scrollLeft ?? 0;
    suppressPresetClickRef.current = false;
    setIsPresetStripDragging(true);
    event.preventDefault();
  };

  const handlePresetStripClickCapture = (
    event: ReactMouseEvent<HTMLDivElement>
  ) => {
    if (!suppressPresetClickRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    suppressPresetClickRef.current = false;
  };

  const buildPresetButtonRef =
    (presetId: StylePresetPublicSummary["id"]) =>
    (node: HTMLButtonElement | null) => {
      if (node) {
        presetButtonRefs.current.set(presetId, node);
        return;
      }

      presetButtonRefs.current.delete(presetId);
    };

  const handleUpload = (image: UploadedImage) => {
    runAfterResultResetCheck(() => {
      setUploadedImage(image);
      setErrorState(null);
      setResultImageUrl(null);
    });
  };

  const handleUploadRemove = () => {
    runAfterResultResetCheck(() => {
      setUploadedImage(null);
      setErrorState(null);
      setResultImageUrl(null);
    });
  };

  const handleSourceImageTypeChange = (value: SourceImageType) => {
    if (value === sourceImageType) {
      return;
    }

    runAfterResultResetCheck(() => {
      setSourceImageType(value);
      setErrorState(null);
      setResultImageUrl(null);
    });
  };

  const handleBackgroundChangeToggle = (checked: boolean) => {
    if (checked === backgroundChange || isBackgroundChangeDisabled) {
      return;
    }

    runAfterResultResetCheck(() => {
      setBackgroundChange(checked);
      setErrorState(null);
      setResultImageUrl(null);
    });
  };

  const stopActivePolling = () => {
    activePollStopRef.current?.();
    activePollStopRef.current = null;
  };

  const handleGenerationError = (message: string) => {
    stopActivePolling();
    setActiveAsyncJobStatus(null);
    setQueuedResultImageUrl(null);
    setResultGeneratedImageId(null);
    setErrorState({ message });
    setGenerationPhase("idle");
  };

  const generateImageWithSynchronousPreview = async () => {
    if (!selectedPreset || !uploadedImage || isGenerating) {
      return;
    }

    stopActivePolling();
    setActiveAsyncJobStatus(null);
    setQueuedResultImageUrl(null);
    setResultGeneratedImageId(null);
    setResultImageUrl(null);
    setGenerationPhase("running");
    setErrorState(null);

    try {
      const normalizedFile = await normalizeSourceImage(uploadedImage.file);

      const formData = new FormData();
      formData.set("styleId", selectedPreset.id);
      formData.set("uploadImage", normalizedFile);
      formData.set("sourceImageType", sourceImageType);
      formData.set("backgroundChange", backgroundChange ? "true" : "false");

      const response = await fetch("/style/generate", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            imageDataUrl?: string;
            mimeType?: string;
            signupCta?: boolean;
            signupPath?: string;
            showRateLimitDialog?: boolean;
          }
        | null;

      if (!response.ok) {
        if (payload?.showRateLimitDialog === true) {
          setRateLimitDialogMessage(payload?.error || t("guestRateLimitShort"));
          setGenerationPhase("idle");
          refreshRateLimitStatus();
          void refreshPercoinBalance();
          return;
        }

        setErrorState({
          message: payload?.error || t("generationFailed"),
          showSignupCta: payload?.signupCta === true,
          signupPath:
            typeof payload?.signupPath === "string" ? payload.signupPath : undefined,
        });
        setGenerationPhase("idle");
        refreshRateLimitStatus();
        void refreshPercoinBalance();
        return;
      }

      if (!payload?.imageDataUrl || typeof payload.imageDataUrl !== "string") {
        throw new Error(t("unknownError"));
      }

      setQueuedResultImageUrl(payload.imageDataUrl);
      setGenerationPhase("completing");
      refreshRateLimitStatus();
    } catch (error) {
      setQueuedResultImageUrl(null);
      setErrorState({
        message: error instanceof Error ? error.message : t("unknownError"),
      });
      setGenerationPhase("idle");
    }
  };

  const generateImageWithAsyncJob = async () => {
    if (!selectedPreset || !uploadedImage || isGenerating) {
      return;
    }

    stopActivePolling();
    setActiveAsyncJobStatus(null);
    setQueuedResultImageUrl(null);
    setResultGeneratedImageId(null);
    setResultImageUrl(null);
    setGenerationPhase("running");
    setErrorState(null);

    try {
      const normalizedFile = await normalizeSourceImage(uploadedImage.file);

      const formData = new FormData();
      formData.set("styleId", selectedPreset.id);
      formData.set("uploadImage", normalizedFile);
      formData.set("sourceImageType", sourceImageType);
      formData.set("backgroundChange", backgroundChange ? "true" : "false");

      const response = await fetch("/style/generate-async", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            jobId?: string;
            status?: AsyncGenerationStatus["status"];
            signupCta?: boolean;
            signupPath?: string;
            showRateLimitDialog?: boolean;
          }
        | null;

      if (!response.ok) {
        if (payload?.showRateLimitDialog === true) {
          setRateLimitDialogMessage(payload?.error || t("guestRateLimitShort"));
          setGenerationPhase("idle");
          refreshRateLimitStatus();
          return;
        }

        setErrorState({
          message: payload?.error || t("generationFailed"),
          showSignupCta: payload?.signupCta === true,
          signupPath:
            typeof payload?.signupPath === "string" ? payload.signupPath : undefined,
        });
        setGenerationPhase("idle");
        refreshRateLimitStatus();
        return;
      }

      if (!payload?.jobId || typeof payload.jobId !== "string") {
        throw new Error(t("unknownError"));
      }

      const initialStatus =
        payload.status === "queued" ||
        payload.status === "processing" ||
        payload.status === "succeeded" ||
        payload.status === "failed"
          ? payload.status
          : "queued";
      setActiveAsyncJobStatus({
        id: payload.jobId,
        status: initialStatus,
        processingStage: "queued",
        previewImageUrl: null,
        resultImageUrl: null,
        errorMessage: null,
        generatedImageId: null,
      });

      const latestKnownStatus = await getGenerationStatus(payload.jobId).catch(() => ({
        id: payload.jobId as string,
        status: initialStatus,
        processingStage: "queued" as const,
        previewImageUrl: null,
        resultImageUrl: null,
        errorMessage: null,
        generatedImageId: null,
      }));
      setActiveAsyncJobStatus(latestKnownStatus);

      const { promise, stop } = pollGenerationStatus(payload.jobId, {
        interval: getStyleAsyncPollingIntervalMs,
        onStatusUpdate: (status) => {
          setActiveAsyncJobStatus(status);
        },
      });
      activePollStopRef.current = stop;

      const finalStatus = await promise;
      stopActivePolling();
      setActiveAsyncJobStatus(finalStatus);

      if (finalStatus.status !== "succeeded" || !finalStatus.resultImageUrl) {
        handleGenerationError(
          finalStatus.errorMessage || t("generationFailed")
        );
        refreshRateLimitStatus();
        void refreshPercoinBalance();
        return;
      }

      setQueuedResultImageUrl(finalStatus.resultImageUrl);
      setResultGeneratedImageId(finalStatus.generatedImageId ?? null);
      setGenerationPhase("completing");
      refreshRateLimitStatus();
      void refreshPercoinBalance();
      void recordStyleUsageClientEvent({
        eventType: "generate",
        styleId: selectedPreset.id,
      }).catch(() => {
        // Tracking failures should not affect the page UX.
      });
    } catch (error) {
      handleGenerationError(
        error instanceof Error ? error.message : t("unknownError")
      );
      void refreshPercoinBalance();
    }
  };

  const generateImage = async () => {
    if (shouldUseAsyncGeneration) {
      await generateImageWithAsyncJob();
      return;
    }

    await generateImageWithSynchronousPreview();
  };

  const handleGenerate = () => {
    void runAfterResultResetCheck(() => {
      void generateImage();
    }, "regenerate");
  };

  const resultConfirmationTitle =
    resultConfirmationIntent === "regenerate"
      ? effectiveAuthState === "authenticated"
        ? t("resultReplaceConfirmTitleAuthenticated")
        : t("resultReplaceConfirmTitle")
      : effectiveAuthState === "authenticated"
        ? t("resultResetConfirmTitleAuthenticated")
        : t("resultResetConfirmTitle");
  const resultConfirmationDescription =
    resultConfirmationIntent === "regenerate"
      ? effectiveAuthState === "authenticated"
        ? t("resultReplaceConfirmDescriptionAuthenticated")
        : t("resultReplaceConfirmDescription")
      : effectiveAuthState === "authenticated"
        ? t("resultResetConfirmDescriptionAuthenticated")
        : t("resultResetConfirmDescription");
  const resultConfirmationActionLabel =
    resultConfirmationIntent === "regenerate"
      ? effectiveAuthState === "authenticated"
        ? t("resultReplaceConfirmActionAuthenticated")
        : t("resultReplaceConfirmAction")
      : effectiveAuthState === "authenticated"
        ? t("resultResetConfirmActionAuthenticated")
        : t("resultResetConfirmAction");
  const generationStatusTitle = isCompletingGeneration
    ? t("generationStatusCompleteTitle")
    : t("generationStatusTitle");
  const generationStatusHint = isCompletingGeneration
    ? t("generationStatusCompleteHint")
    : t("generationStatusHint");
  const generateButtonLabel = isGenerating
    ? t("generatingButton")
    : isAuthenticatedPaidOnlyMode
      ? t("paidGenerateButton", {
          cost: STYLE_PAID_GENERATION_COST,
        })
      : t("generateButton");

  useEffect(() => {
    if (!selectedPreset || hasTrackedVisitRef.current) {
      return;
    }

    hasTrackedVisitRef.current = true;
    void recordStyleUsageClientEvent({
      eventType: "visit",
      styleId: null,
    }).catch(() => {
      // Tracking failures should not affect the page UX.
    });
  }, [selectedPreset]);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-gray-900">
            {t("sectionTitle")}
          </h2>
          <p className="text-sm leading-6 text-slate-500">
            {t("sectionDescription")}
          </p>
        </div>
        <div
          ref={presetStripRef}
          data-testid="style-preset-strip"
          className={`flex gap-4 overflow-x-auto pb-2 ${
            isPresetStripDragging ? "cursor-grabbing select-none" : "md:cursor-grab"
          }`}
          onMouseDown={handlePresetStripMouseDown}
          onClickCapture={handlePresetStripClickCapture}
          onDragStart={(event) => event.preventDefault()}
        >
          {presets.map((preset) => (
            <StylePresetPreviewCard
              key={preset.id}
              preset={preset}
              isSelected={preset.id === selectedPreset?.id}
              onClick={() => handlePresetSelect(preset.id)}
              buttonRef={buildPresetButtonRef(preset.id)}
              alt={t("styleCardAlt", { name: preset.title })}
              disabled={isGenerating}
            />
          ))}
        </div>
      </section>

      <section className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-gray-900">
            {t("characterSectionTitle")}
          </h2>
          <p className="text-sm leading-6 text-slate-500">
            {t("characterSectionDescription")}
          </p>
        </div>
        <section
          data-testid="style-reference-card"
          className={`relative ml-auto rounded-xl border border-slate-200 bg-white shadow-sm transition-[width,padding] duration-200 ${
            isReferenceCardCollapsed ? "w-[50%] p-2" : "w-full p-4"
          }`}
        >
          <button
            type="button"
            onClick={() => setIsReferenceCardCollapsed((previous) => !previous)}
            className={`absolute z-30 inline-flex h-6 w-6 items-center justify-center rounded border border-slate-300 bg-white/90 text-slate-700 shadow-sm transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 ${
              isReferenceCardCollapsed ? "right-1 top-1" : "right-2 top-2"
            }`}
            disabled={isGenerating}
            aria-label={
              isReferenceCardCollapsed
                ? t("expandReferenceCardAria")
                : t("collapseReferenceCardAria")
            }
            title={
              isReferenceCardCollapsed
                ? t("expandReferenceCardTitle")
                : t("collapseReferenceCardTitle")
            }
          >
            {isReferenceCardCollapsed ? (
              <Maximize2 size={12} aria-hidden="true" />
            ) : (
              <Minimize2 size={12} aria-hidden="true" />
            )}
          </button>

          <div
            className={`grid grid-cols-2 ${
              isReferenceCardCollapsed ? "gap-1 md:gap-1" : "gap-3 md:gap-6"
            }`}
          >
            <div className="min-w-0">
              <ImageUploader
                onImageUpload={handleUpload}
                onImageRemove={handleUploadRemove}
                value={uploadedImage}
                label={t("uploadLabel")}
                addImageLabel={t("addImageAction")}
                compact={isReferenceCardCollapsed}
                disabled={isGenerating}
                aspectRatio={selectedPresetAspectRatio}
                filledPreviewMode="natural"
              />
            </div>

            {selectedPreset ? (
              <StyleReferencePanel
                label={t("styleLabel")}
                imageSrc={selectedPreset.thumbnailImageUrl}
                imageAlt={t("styleImageAlt")}
                className={isReferenceCardCollapsed ? "min-w-0 space-y-1" : "min-w-0 space-y-3"}
                collapsed={isReferenceCardCollapsed}
                aspectRatio={selectedPresetAspectRatio}
              />
            ) : null}
          </div>
        </section>

        <Card className="p-6">
          <div className="space-y-6">
            <div>
              <Label className="text-base font-medium block">
                {t("sourceImageTypeLabel")}
              </Label>
              <RadioGroup
                value={sourceImageType}
                onValueChange={(value) =>
                  handleSourceImageTypeChange(value as SourceImageType)
                }
                className="mt-2 flex items-center gap-6"
                disabled={isGenerating}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem
                    id="style-source-image-type-illustration"
                    value="illustration"
                  />
                  <Label
                    htmlFor="style-source-image-type-illustration"
                    className="text-sm font-medium leading-none"
                  >
                    {t("sourceImageTypeIllustration")}
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem
                    id="style-source-image-type-real"
                    value="real"
                  />
                  <Label
                    htmlFor="style-source-image-type-real"
                    className="text-sm font-medium leading-none"
                  >
                    {t("sourceImageTypeReal")}
                  </Label>
                </div>
              </RadioGroup>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {t("sourceImageTypeHint")}
              </p>
            </div>

            <div>
              <div className="space-y-2">
                <Label className="text-base font-medium block">
                  {t("backgroundChangeLabel")}
                </Label>
                <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <Checkbox
                    id="style-background-change"
                    checked={backgroundChange}
                    onCheckedChange={(checked) =>
                      handleBackgroundChangeToggle(checked === true)
                    }
                    disabled={isBackgroundChangeDisabled}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 space-y-1">
                    <Label
                      htmlFor="style-background-change"
                      className={`text-sm font-medium ${
                        isBackgroundChangeDisabled
                          ? "cursor-not-allowed text-slate-400"
                          : "cursor-pointer text-slate-900"
                      }`}
                    >
                      {t("backgroundChangeCheckbox")}
                    </Label>
                    <p className="text-xs leading-5 text-slate-500">
                      {isBackgroundChangeAvailable
                        ? t("backgroundChangeDescription")
                        : t("backgroundChangeDisabledHint")}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <Label className="text-base font-medium mb-3 block">
                {t("modelLabel")}
              </Label>
              <Select value={STYLE_GENERATION_MODEL} disabled>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={STYLE_GENERATION_MODEL}>
                    {t("modelFixedOption")}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-2 text-xs text-slate-500">
                {STYLE_GENERATION_IMAGE_SIZE}px
              </p>
            </div>

            <Button
              type="button"
              className="w-full"
              size="lg"
              disabled={isGenerateDisabled}
              onClick={handleGenerate}
            >
              <Sparkles className="mr-2 h-5 w-5" />
              {generateButtonLabel}
            </Button>
            <div className="space-y-1 text-xs leading-5 text-slate-500">
              <p>{t("generateHint")}</p>
              <p>{t("generateRetryHint")}</p>
              <p>{t("usageLimitHint")}</p>
            </div>

            {typeof remainingDailyNoticeCount === "number" ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-sm font-medium text-amber-900">
                  {t("remainingDailyNotice", {
                    count: remainingDailyNoticeCount,
                  })}
                </p>
              </div>
            ) : null}

            {shouldShowDailyLimitCard ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm font-medium text-red-900">
                  {rateLimitStatus?.authState === "guest"
                    ? t("guestRateLimitDaily")
                    : t("authenticatedRateLimitDaily")}
                </p>
                {rateLimitStatus?.authState === "guest" ? (
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs leading-5 text-red-800">
                      {t("guestRateLimitSignupHint")}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() =>
                        router.push(
                          `/signup?${new URLSearchParams({ next: "/style" }).toString()}`
                        )
                      }
                    >
                      {t("guestRateLimitSignupAction")}
                    </Button>
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <p className="text-xs leading-5 text-red-800">
                      {t("authenticatedPaidContinueHint", {
                        cost: STYLE_PAID_GENERATION_COST,
                      })}
                    </p>
                    <div className="rounded-lg border border-red-100 bg-white/70 px-3 py-2">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-red-700">
                        {t("percoinBalanceLabel")}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-red-900">
                        {percoinBalanceState.isLoading
                          ? t("percoinBalanceLoading")
                          : typeof percoinBalanceState.balance === "number"
                            ? t("percoinBalanceValue", {
                                balance: percoinBalanceState.balance.toLocaleString(),
                              })
                            : t("percoinBalanceUnavailable")}
                      </p>
                    </div>
                    {percoinBalanceState.error ? (
                      <p className="text-xs leading-5 text-red-800">
                        {t("percoinBalanceFetchFailed")}
                      </p>
                    ) : null}
                    {!percoinBalanceState.isLoading &&
                    !percoinBalanceState.error &&
                    !hasEnoughPercoins ? (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs leading-5 text-red-800">
                          {t("authenticatedPaidInsufficientBalance", {
                            cost: STYLE_PAID_GENERATION_COST,
                          })}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          className="w-full sm:w-auto"
                          onClick={() => router.push(getPercoinPurchaseUrl())}
                        >
                          {t("percoinPurchaseAction")}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}

            {isGenerating ? (
              isAsyncStatusCard ? (
                <GenerationStatusCard
                  title={generationStatusTitle}
                  message={asyncStatusCardMessage}
                  liveMessage={asyncStatusCardLiveMessage}
                  footerText={asyncStatusCardHint}
                  progress={asyncStatusCardProgress}
                  progressTransitionDurationMs={
                    asyncStatusCardProgressTransitionDurationMs
                  }
                  animateFromZeroOnMount
                  isComplete={isCompletingGeneration}
                  prefersReducedMotion={asyncStatusCardPrefersReducedMotion}
                />
              ) : (
                <StyleGenerationStatusCard
                  title={generationStatusTitle}
                  message={guestStatusCardMessage}
                  liveMessage={guestStatusCardLiveMessage}
                  hint={generationStatusHint}
                  slowHint={t("generationStatusSlowHint")}
                  progress={guestStatusCardProgress}
                  isLongWait={guestStatusCardIsLongWait}
                  isComplete={isCompletingGeneration}
                  prefersReducedMotion={guestStatusCardPrefersReducedMotion}
                />
              )
            ) : null}
          </div>
        </Card>
      </section>

      {errorState ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-900">{errorState.message}</p>
          {errorState.showSignupCta ? (
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-red-800">
                {t("guestRateLimitSignupHint")}
              </p>
              <Button
                type="button"
                size="sm"
                className="w-full sm:w-auto"
                onClick={() =>
                  router.push(
                    errorState.signupPath ??
                      `/signup?${new URLSearchParams({ next: "/style" }).toString()}`
                  )
                }
              >
                {t("guestRateLimitSignupAction")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {resultGeneratedImageId ? (
        <PostModal
          open={isPostModalOpen}
          onOpenChange={setIsPostModalOpen}
          imageId={resultGeneratedImageId}
        />
      ) : null}

      <StyleResultPanel
        title={t("resultsTitle")}
        placeholder={t("resultPlaceholder")}
        resultImageUrl={displayedResultImageUrl}
        resultImageAlt={t("resultImageAlt")}
        action={
          displayedResultImageUrl ? (
            <div className="flex items-center gap-2">
              <StyleResultDownloadButton
                imageUrl={resultImageUrl ?? displayedResultImageUrl}
                styleId={selectedPreset?.id ?? "unknown"}
                label={t("downloadAction")}
                ariaLabel={t("downloadAriaLabel")}
                successTitle={t("downloadSuccessTitle")}
                successDescription={t("downloadSuccessDescription")}
                failedMessage={t("downloadFailed")}
              />
              {canPostGeneratedResult ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsPostModalOpen(true)}
                  className="flex h-9 items-center gap-2 rounded-full border-slate-300 px-3 text-sm font-medium text-slate-700 shadow-sm"
                >
                  <Share2 className="h-4 w-4" />
                  <span>{postsT("postSubmit")}</span>
                </Button>
              ) : null}
            </div>
          ) : null
        }
      />
      <p className="text-xs leading-5 text-slate-500">
        {t("resultSaveHint")}
      </p>

      <AlertDialog
        open={isResultResetDialogOpen}
        onOpenChange={handleResultResetDialogChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{resultConfirmationTitle}</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line">
              {resultConfirmationDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("resultResetConfirmCancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmResultReset}>
              {resultConfirmationActionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(rateLimitDialogMessage)}
        onOpenChange={(open) => {
          if (!open) {
            setRateLimitDialogMessage(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("rateLimitDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {rateLimitDialogMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setRateLimitDialogMessage(null)}>
              {t("rateLimitDialogClose")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
