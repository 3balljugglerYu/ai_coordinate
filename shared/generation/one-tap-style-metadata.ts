import {
  normalizeStyleOutputAspectRatioMode,
  type StyleOutputAspectRatioMode,
} from "./style-output-aspect-ratio.ts";

export type OneTapStyleBillingMode = "free" | "paid";

export interface OneTapStylePresetMetadata extends Record<string, unknown> {
  id: string;
  title: string;
  thumbnailImageUrl: string;
  thumbnailWidth: number;
  thumbnailHeight: number;
  hasBackgroundPrompt: boolean;
  billingMode: OneTapStyleBillingMode;
  outputAspectRatioMode: StyleOutputAspectRatioMode;
  reservedAttemptId?: string;
  // 投稿詳細などのカードで提供者クレジットを出すため、サーバー側で preset id から
  // ライブ取得した提供者情報を注入する(保存時のスナップショットには含まれない)。
  providerUserId?: string | null;
  providerNickname?: string | null;
  providerAvatarUrl?: string | null;
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
  outputAspectRatioMode?: StyleOutputAspectRatioMode | string | null;
}

interface OneTapStyleMetadataOptions {
  reservedAttemptId?: string | null;
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
  billingMode: OneTapStyleBillingMode = "free",
  options: OneTapStyleMetadataOptions = {}
): OneTapStyleGenerationMetadata {
  return {
    oneTapStyle: {
      id: preset.id,
      title: preset.title,
      thumbnailImageUrl: preset.thumbnailImageUrl,
      thumbnailWidth: preset.thumbnailWidth,
      thumbnailHeight: preset.thumbnailHeight,
      hasBackgroundPrompt: preset.hasBackgroundPrompt,
      outputAspectRatioMode: normalizeStyleOutputAspectRatioMode(
        preset.outputAspectRatioMode,
      ),
      billingMode,
      ...(typeof options.reservedAttemptId === "string" &&
      options.reservedAttemptId.length > 0
        ? { reservedAttemptId: options.reservedAttemptId }
        : {}),
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
    outputAspectRatioMode,
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
    outputAspectRatioMode: normalizeStyleOutputAspectRatioMode(
      outputAspectRatioMode,
    ),
    ...(typeof oneTapStyle.reservedAttemptId === "string"
      ? { reservedAttemptId: oneTapStyle.reservedAttemptId }
      : {}),
    providerUserId:
      typeof oneTapStyle.providerUserId === "string"
        ? oneTapStyle.providerUserId
        : null,
    providerNickname:
      typeof oneTapStyle.providerNickname === "string"
        ? oneTapStyle.providerNickname
        : null,
    providerAvatarUrl:
      typeof oneTapStyle.providerAvatarUrl === "string"
        ? oneTapStyle.providerAvatarUrl
        : null,
  };
}

export function getOneTapStyleReservedAttemptId(
  record: OneTapStyleRecordLike
): string | null {
  const metadata = getOneTapStylePresetMetadata(record);
  return typeof metadata?.reservedAttemptId === "string"
    ? metadata.reservedAttemptId
    : null;
}
