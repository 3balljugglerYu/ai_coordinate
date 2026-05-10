export const GPT_IMAGE_2_LEGACY_LOW_MODEL = "gpt-image-2-low" as const;

export const GPT_IMAGE_2_QUALITIES = ["low", "medium", "high"] as const;
export type GptImage2Quality = (typeof GPT_IMAGE_2_QUALITIES)[number];

export const GPT_IMAGE_2_SIZE_TIERS = ["1k", "2k", "4k"] as const;
export type GptImage2SizeTier = (typeof GPT_IMAGE_2_SIZE_TIERS)[number];

export type GptImage2CanonicalModel =
  `gpt-image-2-${GptImage2Quality}-${GptImage2SizeTier}`;

export const GPT_IMAGE_2_CANONICAL_MODELS = GPT_IMAGE_2_QUALITIES.flatMap(
  (quality) =>
    GPT_IMAGE_2_SIZE_TIERS.map(
      (sizeTier) => `gpt-image-2-${quality}-${sizeTier}` as const
    )
) as ReadonlyArray<GptImage2CanonicalModel>;

export const DEFAULT_GPT_IMAGE_2_MODEL =
  "gpt-image-2-low-1k" satisfies GptImage2CanonicalModel;

export const GPT_IMAGE_2_PERCOIN_COSTS = {
  "gpt-image-2-low-1k": 10,
  "gpt-image-2-low-2k": 20,
  "gpt-image-2-low-4k": 40,
  "gpt-image-2-medium-1k": 20,
  "gpt-image-2-medium-2k": 50,
  "gpt-image-2-medium-4k": 80,
  "gpt-image-2-high-1k": 50,
  "gpt-image-2-high-2k": 80,
  "gpt-image-2-high-4k": 130,
} as const satisfies Record<GptImage2CanonicalModel, number>;

const GPT_IMAGE_2_CANONICAL_MODEL_SET = new Set<string>(
  GPT_IMAGE_2_CANONICAL_MODELS
);

export function isGptImage2CanonicalModel(
  value: unknown
): value is GptImage2CanonicalModel {
  return (
    typeof value === "string" && GPT_IMAGE_2_CANONICAL_MODEL_SET.has(value)
  );
}

export function isLegacyGptImage2Model(
  value: unknown
): value is typeof GPT_IMAGE_2_LEGACY_LOW_MODEL {
  return value === GPT_IMAGE_2_LEGACY_LOW_MODEL;
}

export function normalizeLegacyGptImage2Model(
  value: string
): GptImage2CanonicalModel | string {
  return isLegacyGptImage2Model(value) ? DEFAULT_GPT_IMAGE_2_MODEL : value;
}

export interface ParsedGptImage2Model {
  canonical: GptImage2CanonicalModel;
  quality: GptImage2Quality;
  sizeTier: GptImage2SizeTier;
}

export function composeGptImage2Model(
  quality: GptImage2Quality,
  sizeTier: GptImage2SizeTier
): GptImage2CanonicalModel {
  return `gpt-image-2-${quality}-${sizeTier}`;
}

export function parseGptImage2Model(
  value: string | null | undefined
): ParsedGptImage2Model | null {
  const normalized =
    typeof value === "string" ? normalizeLegacyGptImage2Model(value) : value;
  if (!isGptImage2CanonicalModel(normalized)) {
    return null;
  }
  const [, , , quality, sizeTier] = normalized.split("-") as [
    "gpt",
    "image",
    "2",
    GptImage2Quality,
    GptImage2SizeTier,
  ];
  return {
    canonical: normalized,
    quality,
    sizeTier,
  };
}

export type GptImage2AspectBucket = "square" | "portrait" | "landscape";

export interface GptImage2Dimensions {
  width: number;
  height: number;
}

export const GPT_IMAGE_2_TARGET_SIZES = {
  "1k": {
    square: "1024x1024",
    portrait: "1024x1536",
    landscape: "1536x1024",
  },
  "2k": {
    square: "2048x2048",
    portrait: "1664x2496",
    landscape: "2496x1664",
  },
  "4k": {
    square: "2880x2880",
    portrait: "2352x3520",
    landscape: "3520x2352",
  },
} as const satisfies Record<
  GptImage2SizeTier,
  Record<GptImage2AspectBucket, `${number}x${number}`>
>;

export type GptImage2TargetSize =
  (typeof GPT_IMAGE_2_TARGET_SIZES)[GptImage2SizeTier][GptImage2AspectBucket];

export function resolveGptImage2AspectBucket(
  dimensions: GptImage2Dimensions | null | undefined
): GptImage2AspectBucket {
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    return "square";
  }
  const aspect = dimensions.width / dimensions.height;
  if (aspect < 0.85) return "portrait";
  if (aspect > 1.18) return "landscape";
  return "square";
}

export function getGptImage2TargetSize(
  sizeTier: GptImage2SizeTier,
  dimensions: GptImage2Dimensions | null | undefined
): GptImage2TargetSize {
  const bucket = resolveGptImage2AspectBucket(dimensions);
  return GPT_IMAGE_2_TARGET_SIZES[sizeTier][bucket];
}
