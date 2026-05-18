/**
 * Gemini「Nano Banana」系の family + size tier 型体系。
 *
 * モデル選択 UI を OpenAI gpt-image-2 と同じ仕組み（family の 1 行 + 別カードの
 * size selector）にするための、`shared/generation/openai-image-model.ts` の Gemini 版。
 *
 * family と size の対応:
 *   - nano-2  : 0.5k / 1k
 *   - nano-pro: 1k / 2k / 4k
 *
 * canonical モデル ID は family と size の組み合わせから一意に決まる。命名が
 * Pattern (`flash-image-preview-512` / `flash-image-preview-1024` / `pro-image-1k` ...)
 * になっておらず、文字列の組み立てルールも family ごとに異なるので、テンプレート
 * リテラル型ではなく明示的なマッピング表で持つ。
 */

export const GEMINI_BANANA_FAMILIES = ["nano-2", "nano-pro"] as const;
export type GeminiBananaFamily = (typeof GEMINI_BANANA_FAMILIES)[number];

// 各 family の有効な size tier
export const GEMINI_BANANA_2_SIZE_TIERS = ["0.5k", "1k"] as const;
export const GEMINI_BANANA_PRO_SIZE_TIERS = ["1k", "2k", "4k"] as const;

export type GeminiBanana2SizeTier = (typeof GEMINI_BANANA_2_SIZE_TIERS)[number];
export type GeminiBananaProSizeTier =
  (typeof GEMINI_BANANA_PRO_SIZE_TIERS)[number];

/** family を問わず取り得るサイズの和集合 */
export type GeminiBananaSizeTier =
  | GeminiBanana2SizeTier
  | GeminiBananaProSizeTier;

export type GeminiBananaCanonicalModel =
  | "gemini-3.1-flash-image-preview-512"
  | "gemini-3.1-flash-image-preview-1024"
  | "gemini-3-pro-image-1k"
  | "gemini-3-pro-image-2k"
  | "gemini-3-pro-image-4k";

export const GEMINI_BANANA_2_CANONICAL_MAP = {
  "0.5k": "gemini-3.1-flash-image-preview-512",
  "1k": "gemini-3.1-flash-image-preview-1024",
} as const satisfies Record<
  GeminiBanana2SizeTier,
  GeminiBananaCanonicalModel
>;

export const GEMINI_BANANA_PRO_CANONICAL_MAP = {
  "1k": "gemini-3-pro-image-1k",
  "2k": "gemini-3-pro-image-2k",
  "4k": "gemini-3-pro-image-4k",
} as const satisfies Record<
  GeminiBananaProSizeTier,
  GeminiBananaCanonicalModel
>;

export const GEMINI_BANANA_CANONICAL_MODELS: ReadonlyArray<GeminiBananaCanonicalModel> =
  [
    ...Object.values(GEMINI_BANANA_2_CANONICAL_MAP),
    ...Object.values(GEMINI_BANANA_PRO_CANONICAL_MAP),
  ];

const GEMINI_BANANA_CANONICAL_MODEL_SET = new Set<string>(
  GEMINI_BANANA_CANONICAL_MODELS
);

export function isGeminiBananaCanonicalModel(
  value: unknown
): value is GeminiBananaCanonicalModel {
  return (
    typeof value === "string" && GEMINI_BANANA_CANONICAL_MODEL_SET.has(value)
  );
}

/** 各 family の既定 size tier。family を切り替えた直後に充てる値。 */
export const DEFAULT_GEMINI_BANANA_2_SIZE_TIER: GeminiBanana2SizeTier = "1k";
export const DEFAULT_GEMINI_BANANA_PRO_SIZE_TIER: GeminiBananaProSizeTier = "1k";

export interface ParsedGeminiBananaModel {
  canonical: GeminiBananaCanonicalModel;
  family: GeminiBananaFamily;
  sizeTier: GeminiBananaSizeTier;
}

export function composeGeminiBananaModel(
  family: GeminiBananaFamily,
  sizeTier: GeminiBananaSizeTier
): GeminiBananaCanonicalModel | null {
  if (family === "nano-2") {
    if (sizeTier === "0.5k") return GEMINI_BANANA_2_CANONICAL_MAP["0.5k"];
    if (sizeTier === "1k") return GEMINI_BANANA_2_CANONICAL_MAP["1k"];
    return null;
  }
  // nano-pro
  if (sizeTier === "1k") return GEMINI_BANANA_PRO_CANONICAL_MAP["1k"];
  if (sizeTier === "2k") return GEMINI_BANANA_PRO_CANONICAL_MAP["2k"];
  if (sizeTier === "4k") return GEMINI_BANANA_PRO_CANONICAL_MAP["4k"];
  return null;
}

/**
 * canonical モデル ID から family + sizeTier を復元する。
 * 該当外 / 未知の文字列は null を返す。
 */
export function parseGeminiBananaModel(
  value: string | null | undefined
): ParsedGeminiBananaModel | null {
  if (!isGeminiBananaCanonicalModel(value)) {
    return null;
  }
  switch (value) {
    case "gemini-3.1-flash-image-preview-512":
      return { canonical: value, family: "nano-2", sizeTier: "0.5k" };
    case "gemini-3.1-flash-image-preview-1024":
      return { canonical: value, family: "nano-2", sizeTier: "1k" };
    case "gemini-3-pro-image-1k":
      return { canonical: value, family: "nano-pro", sizeTier: "1k" };
    case "gemini-3-pro-image-2k":
      return { canonical: value, family: "nano-pro", sizeTier: "2k" };
    case "gemini-3-pro-image-4k":
      return { canonical: value, family: "nano-pro", sizeTier: "4k" };
  }
}

/** family を切り替えるときの既定 canonical（最小サイズ）。 */
export function getDefaultCanonicalForFamily(
  family: GeminiBananaFamily
): GeminiBananaCanonicalModel {
  if (family === "nano-2") {
    return GEMINI_BANANA_2_CANONICAL_MAP[DEFAULT_GEMINI_BANANA_2_SIZE_TIER];
  }
  return GEMINI_BANANA_PRO_CANONICAL_MAP[DEFAULT_GEMINI_BANANA_PRO_SIZE_TIER];
}

/** family ごとに許可される size tier を返す。 */
export function getSizeTiersForFamily(
  family: GeminiBananaFamily
): ReadonlyArray<GeminiBananaSizeTier> {
  return family === "nano-2"
    ? GEMINI_BANANA_2_SIZE_TIERS
    : GEMINI_BANANA_PRO_SIZE_TIERS;
}
