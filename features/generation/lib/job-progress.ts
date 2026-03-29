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
