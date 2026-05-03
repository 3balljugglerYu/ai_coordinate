"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { GenerationStatusCard } from "@/features/generation/components/GenerationStatusCard";
import {
  buildCoordinatePreparingCopy,
  buildCoordinateStageCopy,
} from "@/features/generation/lib/coordinate-stage-copy";
import {
  useCoordinateGenerationFeedback,
  type CoordinateGenerationFeedbackPhase,
} from "@/features/generation/hooks/useCoordinateGenerationFeedback";
import {
  pollGenerationStatus,
  type AsyncGenerationStatus,
} from "@/features/generation/lib/async-api";
import {
  normalizeProcessingStage,
  summarizeJobProgress,
} from "@/features/generation/lib/job-progress";
import type { ImageJobProcessingStage } from "@/features/generation/lib/job-types";

// /style と /coordinate と完全に同じ進捗・遷移定数（StylePageClient.tsx, GenerationFormContainer.tsx と同値）
const PREPARING_PROGRESS_PERCENT = 10;
const PREPARING_PROGRESS_TRANSITION_MS = 3000;
// 成功後にステータスカードを「完了状態」のまま表示し続ける時間（/style と同値）
const RESULT_REVEAL_DELAY_MS = 5000;
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

// /style と同じ adaptive polling 間隔
const DEFAULT_POLLING_INTERVAL_MS = 1200;
const FAST_POLLING_INTERVAL_MS = 400;
const SLOW_POLLING_INTERVAL_MS = 1600;

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

interface InspireGenerationFlowCopy {
  // failed / 結果セクションのコピー（inspire 固有）
  statusFailed: string;
  statusFailedDescription: string;
  resultsTitle: string;
  resultsPlaceholder: string;
  resultImageAlt: string;
}

interface InspireGenerationFlowProps {
  jobId: string;
  /** テンプレ画像のアスペクト比（結果カードのサイズ計算用） */
  aspectRatio: number;
  copy: InspireGenerationFlowCopy;
  onComplete?: (status: AsyncGenerationStatus) => void;
}

// /inspire 用の生成中ステータスカード + 結果表示。
// /coordinate / /style と完全に同じ文言・進捗バー・遷移演出を共有するため、
// summarizeJobProgress + ASYNC_PROGRESS_TRANSITION_MS + PREPARING_PROGRESS_PERCENT
// と useCoordinateGenerationFeedback / buildCoordinateStageCopy を /style と同様に組み合わせる。
export function InspireGenerationFlow({
  jobId,
  aspectRatio,
  copy,
  onComplete,
}: InspireGenerationFlowProps) {
  const t = useTranslations("coordinate");
  const [status, setStatus] = useState<AsyncGenerationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  // /style と同じ「running → completing(5s) → idle」3 ステート遷移
  const [phase, setPhase] = useState<CoordinateGenerationFeedbackPhase>(
    "running"
  );
  const stopRef = useRef<(() => void) | null>(null);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const coordinateStageCopy = useMemo(() => buildCoordinateStageCopy(t), [t]);
  const coordinatePreparingCopy = useMemo(
    () => buildCoordinatePreparingCopy(t),
    [t]
  );

  const isFailed = status?.status === "failed" || error !== null;
  // running 中: status card のみ / completing 中: status card は完了状態のまま結果は隠す
  // idle: status card 非表示・結果セクション表示
  const isCompleting = phase === "completing";
  const isRevealed = phase === "idle" && status?.status === "succeeded";

  // /style の StylePageClient.tsx と同じく summarizeJobProgress を使用して
  // representativeStage と progressPercent を導出する（15/20/25/90/95/98/100）
  const progressSummary = status
    ? summarizeJobProgress([
        {
          status: status.status,
          processingStage: normalizeProcessingStage(
            status.status,
            status.processingStage
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

  const isPreparingSubmission = !status;
  const statusCardStage: ImageJobProcessingStage =
    phase === "completing"
      ? "completed"
      : progressSummary.representativeStage;

  const {
    activeMessage,
    displayedMessage,
    activeHint,
    prefersReducedMotion,
  } = useCoordinateGenerationFeedback(
    phase,
    isPreparingSubmission
      ? coordinatePreparingCopy
      : coordinateStageCopy[statusCardStage]
  );

  const displayedProgressPercent =
    phase === "completing"
      ? 100
      : isPreparingSubmission
        ? PREPARING_PROGRESS_PERCENT
        : progressSummary.progressPercent;
  const progressTransitionDurationMs = isPreparingSubmission
    ? PREPARING_PROGRESS_TRANSITION_MS
    : ASYNC_PROGRESS_TRANSITION_MS[statusCardStage];

  // ジョブ成功 → 5 秒間 completing フェーズで祝福、その後 idle で結果へ切り替え。
  // 成功検知は polling コールバック側で行い、ここでは completing → idle のタイマーのみ
  // 管理する（useEffect 内での setState 連鎖を避ける）。
  useEffect(() => {
    if (phase !== "completing") return;
    const timeoutId = window.setTimeout(() => {
      setPhase("idle");
    }, RESULT_REVEAL_DELAY_MS);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [phase]);

  // job poll（adaptive interval は /style と同じ）
  useEffect(() => {
    let isMounted = true;
    const { promise, stop } = pollGenerationStatus(jobId, {
      interval: getStatusPollingIntervalMs,
      onStatusUpdate: (s) => {
        if (!isMounted) return;
        setStatus(s);
        if (s.status === "succeeded") {
          setPhase((prev) => (prev === "running" ? "completing" : prev));
        }
      },
    });
    stopRef.current = stop;

    promise
      .then((finalStatus) => {
        if (!isMounted) return;
        setStatus(finalStatus);
        if (finalStatus.status === "succeeded") {
          setPhase((prev) => (prev === "running" ? "completing" : prev));
        }
        onCompleteRef.current?.(finalStatus);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      isMounted = false;
      stopRef.current?.();
      stopRef.current = null;
    };
  }, [jobId]);

  // /coordinate / /style と同じタイトル選択ロジック
  const generationStatusTitle = isCompleting
    ? t("generationCompletedTitle")
    : t("generatingStatusTitle");

  // 結果画像の集合
  const resultImages = useMemo<Array<{ id: string; url: string }>>(() => {
    if (!status) return [];
    if (status.resultImages && status.resultImages.length > 0) {
      return status.resultImages;
    }
    if (status.resultImageUrl) {
      return [{ id: status.id, url: status.resultImageUrl }];
    }
    return [];
  }, [status]);

  // /style と同じく running / completing の間だけ表示。idle に戻ると消える
  const isStatusCardVisible =
    !isFailed && (phase === "running" || phase === "completing");

  return (
    <div className="space-y-6">
      {isStatusCardVisible && (
        <GenerationStatusCard
          title={generationStatusTitle}
          message={displayedMessage}
          liveMessage={activeMessage}
          footerText={activeHint}
          progress={displayedProgressPercent}
          progressTransitionDurationMs={progressTransitionDurationMs}
          animateFromZeroOnMount
          isComplete={isCompleting}
          prefersReducedMotion={prefersReducedMotion}
        />
      )}

      {/* 失敗時カード */}
      {isFailed && (
        <Card className="border-destructive/50 bg-destructive/5 p-4">
          <p className="text-sm font-semibold text-destructive">
            {copy.statusFailed}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {status?.errorMessage ?? error ?? copy.statusFailedDescription}
          </p>
        </Card>
      )}

      {/* 結果セクション（completing の 5 秒祝福ステートを抜けて idle になってから表示） */}
      {isRevealed && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">
            {copy.resultsTitle}
          </h2>
          {resultImages.length > 0 ? (
            <div
              className={
                resultImages.length === 1
                  ? "flex justify-center"
                  : "grid grid-cols-1 gap-3 sm:grid-cols-2"
              }
            >
              {resultImages.map((image) => (
                <Card
                  key={image.id}
                  className="w-full max-w-[460px] overflow-hidden p-0"
                >
                  <div
                    className="relative bg-slate-100"
                    style={{ aspectRatio: String(aspectRatio) }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.url}
                      alt={copy.resultImageAlt}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-6">
              <p className="text-center text-sm text-muted-foreground">
                {copy.resultsPlaceholder}
              </p>
            </Card>
          )}
        </section>
      )}
    </div>
  );
}
