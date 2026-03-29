import type { AppMessages } from "@/i18n/messages";
import type { ImageJobProcessingStage } from "./job-types";

type CoordinateMessageKey = keyof AppMessages["coordinate"];

type CoordinateTranslationFn = (
  key: CoordinateMessageKey,
  values?: Record<string, string | number>
) => string;

type StageCopyKeyGroup = {
  messages: readonly CoordinateMessageKey[];
  hints: readonly CoordinateMessageKey[];
};

export type CoordinateStageCopyEntry = {
  messages: string[];
  hints: string[];
};

export type CoordinateStageCopy = Record<
  ImageJobProcessingStage,
  CoordinateStageCopyEntry
>;

const PREPARING_COPY_KEYS = {
  messages: [
    "generationStagePreparingMessage1",
    "generationStagePreparingMessage2",
    "generationStagePreparingMessage3",
    "generationStagePreparingMessage4",
    "generationStagePreparingMessage5",
  ],
  hints: [
    "generationStagePreparingHint1",
    "generationStagePreparingHint2",
    "generationStagePreparingHint3",
    "generationStagePreparingHint4",
    "generationStagePreparingHint5",
  ],
} as const satisfies StageCopyKeyGroup;

const STAGE_COPY_KEYS = {
  queued: {
    messages: [
      "generationStageQueuedMessage1",
      "generationStageQueuedMessage2",
      "generationStageQueuedMessage3",
      "generationStageQueuedMessage4",
      "generationStageQueuedMessage5",
    ],
    hints: [
      "generationStageQueuedHint1",
      "generationStageQueuedHint2",
      "generationStageQueuedHint3",
      "generationStageQueuedHint4",
      "generationStageQueuedHint5",
    ],
  },
  processing: {
    messages: [
      "generationStageProcessingMessage1",
      "generationStageProcessingMessage2",
      "generationStageProcessingMessage3",
      "generationStageProcessingMessage4",
      "generationStageProcessingMessage5",
    ],
    hints: [
      "generationStageProcessingHint1",
      "generationStageProcessingHint2",
      "generationStageProcessingHint3",
      "generationStageProcessingHint4",
      "generationStageProcessingHint5",
    ],
  },
  charging: {
    messages: [
      "generationStageChargingMessage1",
      "generationStageChargingMessage2",
      "generationStageChargingMessage3",
      "generationStageChargingMessage4",
      "generationStageChargingMessage5",
    ],
    hints: [
      "generationStageChargingHint1",
      "generationStageChargingHint2",
      "generationStageChargingHint3",
      "generationStageChargingHint4",
      "generationStageChargingHint5",
    ],
  },
  generating: {
    messages: [
      "generationStageGeneratingMessage1",
      "generationStageGeneratingMessage2",
      "generationStageGeneratingMessage3",
      "generationStageGeneratingMessage4",
      "generationStageGeneratingMessage5",
      "generationStageGeneratingMessage6",
      "generationStageGeneratingMessage7",
      "generationStageGeneratingMessage8",
      "generationStageGeneratingMessage9",
      "generationStageGeneratingMessage10",
    ],
    hints: [
      "generationStageGeneratingHint1",
      "generationStageGeneratingHint2",
      "generationStageGeneratingHint3",
      "generationStageGeneratingHint4",
      "generationStageGeneratingHint5",
    ],
  },
  uploading: {
    messages: [
      "generationStageUploadingMessage1",
      "generationStageUploadingMessage2",
      "generationStageUploadingMessage3",
      "generationStageUploadingMessage4",
      "generationStageUploadingMessage5",
    ],
    hints: [
      "generationStageUploadingHint1",
      "generationStageUploadingHint2",
      "generationStageUploadingHint3",
      "generationStageUploadingHint4",
      "generationStageUploadingHint5",
    ],
  },
  persisting: {
    messages: [
      "generationStagePersistingMessage1",
      "generationStagePersistingMessage2",
      "generationStagePersistingMessage3",
      "generationStagePersistingMessage4",
      "generationStagePersistingMessage5",
    ],
    hints: [
      "generationStagePersistingHint1",
      "generationStagePersistingHint2",
      "generationStagePersistingHint3",
      "generationStagePersistingHint4",
      "generationStagePersistingHint5",
    ],
  },
  completed: {
    messages: [
      "generationStageCompletedMessage1",
      "generationStageCompletedMessage2",
      "generationStageCompletedMessage3",
      "generationStageCompletedMessage4",
      "generationStageCompletedMessage5",
    ],
    hints: [
      "generationStageCompletedHint1",
      "generationStageCompletedHint2",
      "generationStageCompletedHint3",
      "generationStageCompletedHint4",
      "generationStageCompletedHint5",
    ],
  },
  failed: {
    messages: [
      "generationStageFailedMessage1",
      "generationStageFailedMessage2",
      "generationStageFailedMessage3",
      "generationStageFailedMessage4",
      "generationStageFailedMessage5",
    ],
    hints: [
      "generationStageFailedHint1",
      "generationStageFailedHint2",
      "generationStageFailedHint3",
      "generationStageFailedHint4",
      "generationStageFailedHint5",
    ],
  },
} as const satisfies Record<ImageJobProcessingStage, StageCopyKeyGroup>;

export function buildCoordinateStageCopy(
  t: CoordinateTranslationFn
): CoordinateStageCopy {
  return Object.fromEntries(
    Object.entries(STAGE_COPY_KEYS).map(([stage, keys]) => [
      stage,
      {
        messages: keys.messages.map((key) => t(key)),
        hints: keys.hints.map((key) => t(key)),
      },
    ])
  ) as CoordinateStageCopy;
}

export function buildCoordinatePreparingCopy(
  t: CoordinateTranslationFn
): CoordinateStageCopyEntry {
  return {
    messages: PREPARING_COPY_KEYS.messages.map((key) => t(key)),
    hints: PREPARING_COPY_KEYS.hints.map((key) => t(key)),
  };
}
