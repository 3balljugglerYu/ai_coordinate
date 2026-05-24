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

export interface GptImage2Dimensions {
  width: number;
  height: number;
}

/**
 * tier 別の出力サイズ上限。
 * - `maxEdge`: 長辺の上限（OpenAI 公式 image-generation 仕様の最大 3840px を超えない）
 * - `maxPixels`: 総ピクセル数の上限（OpenAI 公式 8,294,400 を超えない）
 *
 * tier ごとに「rect 系の OpenAI 推奨上限」を採用しているため、1:1 入力でも
 * 同じ tier 内ではピクセル予算が同じになる（例: 1K の 1:1 は 1248×1248 ≈ 1.55M で生成）。
 */
export const GPT_IMAGE_2_TIER_LIMITS: Record<
  GptImage2SizeTier,
  { maxEdge: number; maxPixels: number }
> = {
  "1k": { maxEdge: 1536, maxPixels: 1024 * 1536 },
  "2k": { maxEdge: 2496, maxPixels: 2048 * 2048 },
  "4k": { maxEdge: 3840, maxPixels: 3840 * 2160 },
};

export type GptImage2TargetSize = `${number}x${number}`;

const SIZE_MULTIPLE = 16;
// 出力アスペクト比の上限。1:3 等の極端な縦長/横長を抑え、スマホ標準の 9:16 / 16:9 に揃える。
// 入力画像はクロップせず、出力サイズ側で丸める方針 (AI が再構成)。
const MAX_ASPECT_RATIO = 16 / 9;

/**
 * 入力画像のアスペクト比を保ったまま、tier の上限内で最大の出力サイズを計算する。
 *
 * - OpenAI gpt-image-2 制約: 長辺 ≤ 3840 / 総ピクセル ≤ 8,294,400 / 16 の倍数
 * - 出力アスペクトは 9:16 ≤ aspect ≤ 16/9 にクランプ (これより極端な入力は再構成される)
 * - 入力 dimensions が null / 無効値のときは正方形扱い（1:1）
 */
export function computeGptImage2OptimalSize(
  sizeTier: GptImage2SizeTier,
  dimensions: GptImage2Dimensions | null | undefined
): GptImage2TargetSize {
  const { maxEdge, maxPixels } = GPT_IMAGE_2_TIER_LIMITS[sizeTier];

  // 入力アスペクトの算出（width / height）。無効なら 1:1 とみなす。
  let aspect = 1;
  if (
    dimensions &&
    dimensions.width > 0 &&
    dimensions.height > 0
  ) {
    aspect = dimensions.width / dimensions.height;
  }
  // 出力アスペクト比を 9:16 ≤ aspect ≤ 16:9 にクランプ
  aspect = Math.max(1 / MAX_ASPECT_RATIO, Math.min(MAX_ASPECT_RATIO, aspect));

  // 長辺を maxEdge 起点で算出
  let width: number;
  let height: number;
  if (aspect >= 1) {
    width = maxEdge;
    height = maxEdge / aspect;
  } else {
    height = maxEdge;
    width = maxEdge * aspect;
  }

  // 総ピクセル上限内に収まるようスケール
  if (width * height > maxPixels) {
    const scale = Math.sqrt(maxPixels / (width * height));
    width *= scale;
    height *= scale;
  }

  // 16 の倍数に丸める（四捨五入）
  width = Math.round(width / SIZE_MULTIPLE) * SIZE_MULTIPLE;
  height = Math.round(height / SIZE_MULTIPLE) * SIZE_MULTIPLE;

  // 丸めにより上限を超えた場合は、長辺を 16 ずつ縮める
  while (width * height > maxPixels) {
    if (width >= height) {
      width -= SIZE_MULTIPLE;
    } else {
      height -= SIZE_MULTIPLE;
    }
  }

  // maxEdge を超えていないことの最終ガード
  if (width > maxEdge) {
    width = Math.floor(maxEdge / SIZE_MULTIPLE) * SIZE_MULTIPLE;
  }
  if (height > maxEdge) {
    height = Math.floor(maxEdge / SIZE_MULTIPLE) * SIZE_MULTIPLE;
  }

  // 最小値ガード（16px 未満は不正）
  width = Math.max(SIZE_MULTIPLE, width);
  height = Math.max(SIZE_MULTIPLE, height);

  return `${width}x${height}` as GptImage2TargetSize;
}

/**
 * 後方互換のためのエイリアス。新規コードは computeGptImage2OptimalSize を使う。
 */
export function getGptImage2TargetSize(
  sizeTier: GptImage2SizeTier,
  dimensions: GptImage2Dimensions | null | undefined
): GptImage2TargetSize {
  return computeGptImage2OptimalSize(sizeTier, dimensions);
}
