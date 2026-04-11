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
import { Download, Maximize2, Minimize2, Sparkles } from "lucide-react";
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
  normalizeProcessingStage,
  summarizeJobProgress,
} from "@/features/generation/lib/job-progress";
import type { UploadedImage } from "@/features/generation/types";
import type { SourceImageType } from "@/shared/generation/prompt-core";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";
import { STYLE_GENERATION_IMAGE_SIZE, STYLE_GENERATION_MODEL } from "@/features/style/lib/constants";
import { useGenerationFeedback } from "@/features/style/hooks/useGenerationFeedback";
import { recordStyleUsageClientEvent } from "@/features/style/lib/style-usage-client";
import { StyleGenerationStatusCard } from "@/features/style/components/StyleGenerationStatusCard";
import { StylePresetPreviewCard } from "@/features/style/components/StylePresetPreviewCard";
import { getExtensionFromMimeType } from "@/lib/utils";
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

type ResultConfirmationIntent = "change" | "regenerate";
type GenerationPhase = "idle" | "running" | "completing";

const RESULT_REVEAL_DELAY_MS = 5000;

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

function buildStyleResultFileName(mimeType: string): string {
  const extension = getExtensionFromMimeType(mimeType);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `one-tap-style-${timestamp}.${extension}`;
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

  const downloadBlob = async () => {
    const response = await fetch(imageUrl, { mode: "cors" });
    if (!response.ok) {
      throw new Error(failedMessage);
    }

    return response.blob();
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
      const blob = await downloadBlob();
      const mimeType = blob.type || "image/png";
      const fileName = buildStyleResultFileName(mimeType);

      if (
        isMobileDevice() &&
        typeof navigator !== "undefined" &&
        navigator.canShare &&
        navigator.canShare({
          files: [new File([blob], fileName, { type: mimeType })],
        })
      ) {
        await navigator.share({
          files: [new File([blob], fileName, { type: mimeType })],
          title: "Persta.AI",
        });
        void recordStyleUsageClientEvent({
          eventType: "download",
          styleId,
        }).catch(() => {
          // Usage tracking must not block the successful share flow.
        });
      } else {
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
      }
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (
        (error instanceof DOMException && error.name === "AbortError") ||
        message.includes("user gesture") ||
        message.includes("share request")
      ) {
        return;
      }

      console.error("Style result download error:", error);
      toast({
        title: error instanceof Error ? error.message : failedMessage,
        variant: "destructive",
      });
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
  const presetStripRef = useRef<HTMLDivElement | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<
    StylePresetPublicSummary["id"]
  >(() => resolveInitialSelectedPresetId(presets, initialSelectedPresetId));
  const [uploadedImage, setUploadedImage] = useState<UploadedImage | null>(null);
  const [sourceImageType, setSourceImageType] = useState<SourceImageType>("illustration");
  const [backgroundChange, setBackgroundChange] = useState(false);
  const [generationPhase, setGenerationPhase] = useState<GenerationPhase>("idle");
  const [resultImageUrl, setResultImageUrl] = useState<string | null>(null);
  const [queuedResultImageUrl, setQueuedResultImageUrl] = useState<string | null>(null);
  const [errorState, setErrorState] = useState<StyleErrorState | null>(null);
  const [rateLimitStatus, setRateLimitStatus] =
    useState<StyleRateLimitStatusState | null>(null);
  const [activeAsyncJobStatus, setActiveAsyncJobStatus] =
    useState<AsyncGenerationStatus | null>(null);
  const [rateLimitDialogMessage, setRateLimitDialogMessage] = useState<string | null>(null);
  const [isReferenceCardCollapsed, setIsReferenceCardCollapsed] = useState(false);
  const [isResultResetDialogOpen, setIsResultResetDialogOpen] = useState(false);
  const [isPresetStripDragging, setIsPresetStripDragging] = useState(false);
  const [resultConfirmationIntent, setResultConfirmationIntent] =
    useState<ResultConfirmationIntent>("change");
  const pendingResultResetActionRef = useRef<null | (() => void)>(null);
  const activePollStopRef = useRef<(() => void) | null>(null);
  const hasTrackedVisitRef = useRef(false);
  const presetDragStartXRef = useRef(0);
  const presetDragStartScrollLeftRef = useRef(0);
  const suppressPresetClickRef = useRef(false);

  const selectedPreset =
    presets.find((preset) => preset.id === selectedPresetId) ?? presets[0] ?? null;
  const effectiveAuthState = rateLimitStatus?.authState ?? initialAuthState ?? null;
  const shouldUseAsyncGeneration = effectiveAuthState === "authenticated";

  const isGenerating = generationPhase !== "idle";
  const isBackgroundChangeAvailable = Boolean(selectedPreset?.hasBackgroundPrompt);
  const isBackgroundChangeDisabled = isGenerating || !isBackgroundChangeAvailable;
  const isDailyLimitReached =
    rateLimitStatus?.remainingDaily === 0 &&
    (rateLimitStatus.authState === "authenticated" ||
      rateLimitStatus.authState === "guest");
  const isGenerateDisabled =
    !selectedPreset || !uploadedImage || isGenerating || isDailyLimitReached;
  const hasGeneratedResult = Boolean(resultImageUrl);
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
  const shouldShowDailyLimitCard = isDailyLimitReached;
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
  const activeAsyncStage = activeAsyncJobStatus
    ? normalizeProcessingStage(
        activeAsyncJobStatus.status,
        activeAsyncJobStatus.processingStage
      )
    : "queued";
  const asyncProgressSummary = activeAsyncJobStatus
    ? summarizeJobProgress([
        {
          status: activeAsyncJobStatus.status,
          processingStage: activeAsyncJobStatus.processingStage,
        },
      ])
    : {
        totalCount: 1,
        completedCount: 0,
        pendingCount: 1,
        representativeStage: "queued" as const,
        progressPercent: 15,
      };
  const isAsyncStatusCard = shouldUseAsyncGeneration && Boolean(activeAsyncJobStatus);
  const asyncStatusHint =
    activeAsyncStage === "uploading" || activeAsyncStage === "persisting"
      ? t("generationStatusMessage11")
      : t("generationStatusHint");
  const statusCardMessage = guestGenerationFeedback.displayedMessage;
  const statusCardLiveMessage = guestGenerationFeedback.activeMessage;
  const statusCardHint = isAsyncStatusCard
    ? asyncStatusHint
    : t("generationStatusHint");
  const statusCardProgress = isAsyncStatusCard
    ? isCompletingGeneration
      ? 100
      : asyncProgressSummary.progressPercent
    : guestGenerationFeedback.progress;
  const statusCardIsLongWait = isAsyncStatusCard ? false : guestGenerationFeedback.isLongWait;
  const statusCardPrefersReducedMotion = guestGenerationFeedback.prefersReducedMotion;

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

  useEffect(() => {
    if (!selectedPreset?.hasBackgroundPrompt && backgroundChange) {
      setBackgroundChange(false);
    }
  }, [backgroundChange, selectedPreset?.hasBackgroundPrompt]);

  useEffect(() => {
    if (
      initialSelectedPresetId &&
      presets.some((preset) => preset.id === initialSelectedPresetId) &&
      initialSelectedPresetId !== selectedPresetId
    ) {
      setSelectedPresetId(initialSelectedPresetId);
      return;
    }

    if (presets.some((preset) => preset.id === selectedPresetId)) {
      return;
    }

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
    setErrorState({ message });
    setGenerationPhase("idle");
  };

  const generateImageWithSynchronousPreview = async () => {
    if (!selectedPreset || !uploadedImage || isGenerating) {
      return;
    }

    stopActivePolling();
    setActiveAsyncJobStatus(null);
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
      });

      const latestKnownStatus = await getGenerationStatus(payload.jobId).catch(() => ({
        id: payload.jobId as string,
        status: initialStatus,
        processingStage: "queued" as const,
        previewImageUrl: null,
        resultImageUrl: null,
        errorMessage: null,
      }));
      setActiveAsyncJobStatus(latestKnownStatus);

      const { promise, stop } = pollGenerationStatus(payload.jobId, {
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
        return;
      }

      setQueuedResultImageUrl(finalStatus.resultImageUrl);
      setGenerationPhase("completing");
      refreshRateLimitStatus();
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
              {isGenerating ? t("generatingButton") : t("generateButton")}
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
                ) : null}
              </div>
            ) : null}

            {isGenerating ? (
              isAsyncStatusCard ? (
                <GenerationStatusCard
                  title={generationStatusTitle}
                  message={statusCardMessage}
                  liveMessage={statusCardLiveMessage}
                  footerText={statusCardHint}
                  progress={statusCardProgress}
                  isComplete={isCompletingGeneration}
                  prefersReducedMotion={statusCardPrefersReducedMotion}
                />
              ) : (
                <StyleGenerationStatusCard
                  title={generationStatusTitle}
                  message={statusCardMessage}
                  liveMessage={statusCardLiveMessage}
                  hint={generationStatusHint}
                  slowHint={t("generationStatusSlowHint")}
                  progress={statusCardProgress}
                  isLongWait={statusCardIsLongWait}
                  isComplete={isCompletingGeneration}
                  prefersReducedMotion={statusCardPrefersReducedMotion}
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

      <StyleResultPanel
        title={t("resultsTitle")}
        placeholder={t("resultPlaceholder")}
        resultImageUrl={resultImageUrl}
        resultImageAlt={t("resultImageAlt")}
        action={
          resultImageUrl ? (
            <StyleResultDownloadButton
              imageUrl={resultImageUrl}
              styleId={selectedPreset?.id ?? "unknown"}
              label={t("downloadAction")}
              ariaLabel={t("downloadAriaLabel")}
              successTitle={t("downloadSuccessTitle")}
              successDescription={t("downloadSuccessDescription")}
              failedMessage={t("downloadFailed")}
            />
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
