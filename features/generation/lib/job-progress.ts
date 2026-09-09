import type { ImageJobProcessingStage, ImageJobStatus } from "./job-types";

export interface JobProgressSource {
  status: ImageJobStatus;
  processingStage?: ImageJobProcessingStage | null;
}

const STAGE_PROGRESS: Record<ImageJobProcessingStage, number> = {
  queued: 15,
  processing: 20,
  charging: 25,
  generating: 90,
  uploading: 95,
  persisting: 98,
  completed: 100,
  failed: 100,
};

/**
 * ステージごとに「帯を伸ばしきるのにかける時間」。上の `STAGE_PROGRESS`
 * (到達点)と対になる表。
 *
 * ⭐ `generating` だけ 25 秒と極端に長い。25% → 90% の大ジャンプをその時間
 * かけて描くことで「ずっと伸び続けている」見え方を作るため。実際の生成も
 * 数十秒かかるので体感と合う。ここを短くすると一瞬で 90% に達して静止し、
 * 「止まっている」ように見える。
 *
 * ⭐⭐ シート内のカード(`GenerationFormContainer` → `GenerationStatusCard`)と、
 * シートを閉じたあとのバー(`GenerationProgressHost` → `GenerationProgressBar`)の
 * **両方がここを参照する**。片方だけ変えると、シートを閉じた瞬間に進み方が
 * 変わって見える(実際にバー側が一律 500ms でその症状になっていた)。
 */
export const STAGE_PROGRESS_TRANSITION_MS: Record<
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

export function normalizeProcessingStage(
  status: ImageJobStatus,
  processingStage?: ImageJobProcessingStage | null
): ImageJobProcessingStage {
  if (processingStage) {
    return processingStage;
  }

  switch (status) {
    case "queued":
      return "queued";
    case "processing":
      return "processing";
    case "succeeded":
      return "completed";
    case "failed":
      return "failed";
    default:
      return "queued";
  }
}

export function isTerminalJobStatus(status: ImageJobStatus): boolean {
  return status === "succeeded" || status === "failed";
}

export function summarizeJobProgress(jobs: readonly JobProgressSource[]) {
  if (jobs.length === 0) {
    return {
      totalCount: 0,
      completedCount: 0,
      pendingCount: 0,
      representativeStage: "queued" as const,
      progressPercent: 0,
    };
  }

  const normalizedJobs = jobs.map((job) => ({
    status: job.status,
    processingStage: normalizeProcessingStage(job.status, job.processingStage),
  }));
  const completedCount = normalizedJobs.filter((job) =>
    isTerminalJobStatus(job.status)
  ).length;
  const pendingCount = normalizedJobs.length - completedCount;
  const activeJobs = normalizedJobs.filter(
    (job) => !isTerminalJobStatus(job.status)
  );

  const representativeStage =
    activeJobs.length > 0
      ? activeJobs.reduce((current, candidate) =>
          STAGE_PROGRESS[candidate.processingStage] >=
          STAGE_PROGRESS[current.processingStage]
            ? candidate
            : current
        ).processingStage
      : normalizedJobs.some((job) => job.status === "failed")
        ? "failed"
        : "completed";

  const progressPercent = Math.round(
    normalizedJobs.reduce(
      (sum, job) => sum + STAGE_PROGRESS[job.processingStage],
      0
    ) / normalizedJobs.length
  );

  return {
    totalCount: normalizedJobs.length,
    completedCount,
    pendingCount,
    representativeStage,
    progressPercent,
  };
}
