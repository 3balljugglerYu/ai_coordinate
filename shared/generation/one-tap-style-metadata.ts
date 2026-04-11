export type OneTapStyleBillingMode = "free" | "paid";

export interface OneTapStylePresetMetadata extends Record<string, unknown> {
  id: string;
  title: string;
  thumbnailImageUrl: string;
  thumbnailWidth: number;
  thumbnailHeight: number;
  hasBackgroundPrompt: boolean;
  billingMode: OneTapStyleBillingMode;
}

export interface OneTapStyleGenerationMetadata extends Record<string, unknown> {
  oneTapStyle: OneTapStylePresetMetadata;
}

interface OneTapStylePresetInput {
  id: string;
  title: string;
  thumbnailImageUrl: string;
  thumbnailWidth: number;
  thumbnailHeight: number;
  hasBackgroundPrompt: boolean;
}

interface OneTapStyleRecordLike {
  generation_type?: string | null;
  generation_metadata?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBillingMode(value: unknown): value is OneTapStyleBillingMode {
  return value === "free" || value === "paid";
}

export function buildOneTapStyleGenerationMetadata(
  preset: OneTapStylePresetInput,
  billingMode: OneTapStyleBillingMode = "free"
): OneTapStyleGenerationMetadata {
  return {
    oneTapStyle: {
      id: preset.id,
      title: preset.title,
      thumbnailImageUrl: preset.thumbnailImageUrl,
      thumbnailWidth: preset.thumbnailWidth,
      thumbnailHeight: preset.thumbnailHeight,
      hasBackgroundPrompt: preset.hasBackgroundPrompt,
      billingMode,
    },
  };
}

export function getOneTapStylePresetMetadata(
  record: OneTapStyleRecordLike
): OneTapStylePresetMetadata | null {
  if (record.generation_type !== "one_tap_style" || !isRecord(record.generation_metadata)) {
    return null;
  }

  const oneTapStyle = record.generation_metadata.oneTapStyle;
  if (!isRecord(oneTapStyle)) {
    return null;
  }

  const {
    id,
    title,
    thumbnailImageUrl,
    thumbnailWidth,
    thumbnailHeight,
    hasBackgroundPrompt,
    billingMode,
  } = oneTapStyle;

  if (
    typeof id !== "string" ||
    typeof title !== "string" ||
    typeof thumbnailImageUrl !== "string" ||
    typeof thumbnailWidth !== "number" ||
    typeof thumbnailHeight !== "number" ||
    typeof hasBackgroundPrompt !== "boolean"
  ) {
    return null;
  }

  return {
    id,
    title,
    thumbnailImageUrl,
    thumbnailWidth,
    thumbnailHeight,
    hasBackgroundPrompt,
    billingMode: isBillingMode(billingMode) ? billingMode : "free",
  };
}
