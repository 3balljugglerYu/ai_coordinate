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

/**
 * Gemini API に送るモデル名(エンドポイント名)。Next.js と worker はここだけを参照する。
 *
 * DB の保存名(`gemini-3.1-flash-image-preview-512` など)は履歴・ペルコイン・CHECK 制約の
 * キーなので変えず、**API に送る名前だけ**を GA 名にしている。プレビュー名
 * (`gemini-3.1-flash-image-preview` / `gemini-3-pro-image-preview`)は公式の停止予定日
 * 2026-06-25 を過ぎていたため、2026-10-22 に置き換えた(nano-banana-2-1 計画書 ADR-004)。
 */
export const GEMINI_API_MODEL_NAMES = {
  legacyFlash: "gemini-2.5-flash-image",
  nano2: "gemini-3.1-flash-image",
  pro: "gemini-3-pro-image",
  /** Nano Banana 2.1(2026-10-06 GA)。考える量は generationConfig の thinkingLevel で送る */
  nano21: "gemini-nano-banana-2.1",
} as const;

export type GeminiApiModel =
  (typeof GEMINI_API_MODEL_NAMES)[keyof typeof GEMINI_API_MODEL_NAMES];

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

// ---------------------------------------------------------------------------
// Nano Banana 2.1(計画書: docs/planning/nano-banana-2-1-implementation-plan.md)
//
// 既存の Nano 2 / Pro(family × size の 2 軸)とは別に、GPT と同じ 3 軸
// (family × 考える量 × size)で持つ。既存の GeminiBananaFamily などに混ぜると、
// その型を使う画面のコードまで変わるため、ここでは足さない。
//
// 保存名は `gemini-nano-banana-2.1-${thinkingLevel}-${sizeTier}`。
// 考える量は内部名(minimal / medium / high)で持ち、画面では「品質」
// low / medium / high として見せる(ADR-002)。
// ---------------------------------------------------------------------------

export const NANO_BANANA_2_1_THINKING_LEVELS = ["minimal", "medium", "high"] as const;
export type NanoBanana21ThinkingLevel = (typeof NANO_BANANA_2_1_THINKING_LEVELS)[number];

/** 2.1 に 0.5k は無い */
export const NANO_BANANA_2_1_SIZE_TIERS = ["1k", "2k", "4k"] as const;
export type NanoBanana21SizeTier = (typeof NANO_BANANA_2_1_SIZE_TIERS)[number];

export type NanoBanana21CanonicalModel =
  `gemini-nano-banana-2.1-${NanoBanana21ThinkingLevel}-${NanoBanana21SizeTier}`;

export interface ParsedNanoBanana21Model {
  canonical: NanoBanana21CanonicalModel;
  thinkingLevel: NanoBanana21ThinkingLevel;
  sizeTier: NanoBanana21SizeTier;
}

export function composeNanoBanana21Model(
  thinkingLevel: NanoBanana21ThinkingLevel,
  sizeTier: NanoBanana21SizeTier
): NanoBanana21CanonicalModel {
  return `gemini-nano-banana-2.1-${thinkingLevel}-${sizeTier}`;
}

/**
 * 保存名 → 分解結果の明示的な表。compose で組み立てた値をキーにするので、
 * 文字列の位置解析(split)に頼らない(OpenAI 側の ADR-002 と同じ考え方)。
 */
export const NANO_BANANA_2_1_PARSED_MODELS: ReadonlyArray<ParsedNanoBanana21Model> =
  NANO_BANANA_2_1_THINKING_LEVELS.flatMap((thinkingLevel) =>
    NANO_BANANA_2_1_SIZE_TIERS.map((sizeTier) => ({
      canonical: composeNanoBanana21Model(thinkingLevel, sizeTier),
      thinkingLevel,
      sizeTier,
    }))
  );

export const NANO_BANANA_2_1_CANONICAL_MODELS: ReadonlyArray<NanoBanana21CanonicalModel> =
  NANO_BANANA_2_1_PARSED_MODELS.map((parsed) => parsed.canonical);

const NANO_BANANA_2_1_PARSE_TABLE: ReadonlyMap<string, ParsedNanoBanana21Model> = new Map(
  NANO_BANANA_2_1_PARSED_MODELS.map((parsed) => [parsed.canonical, parsed])
);

export function isNanoBanana21Model(value: unknown): value is NanoBanana21CanonicalModel {
  return typeof value === "string" && NANO_BANANA_2_1_PARSE_TABLE.has(value);
}

/** 2.1 の保存名でなければ null */
export function parseNanoBanana21Model(
  value: string | null | undefined
): ParsedNanoBanana21Model | null {
  return (value && NANO_BANANA_2_1_PARSE_TABLE.get(value)) || null;
}

const NANO_BANANA_2_1_IMAGE_SIZE = {
  "1k": "1K",
  "2k": "2K",
  "4k": "4K",
} as const satisfies Record<NanoBanana21SizeTier, string>;

/** Gemini API の `imageConfig.imageSize` に送る値 */
export function getNanoBanana21ImageSize(
  sizeTier: NanoBanana21SizeTier
): (typeof NANO_BANANA_2_1_IMAGE_SIZE)[NanoBanana21SizeTier] {
  return NANO_BANANA_2_1_IMAGE_SIZE[sizeTier];
}

/**
 * 2.1 のペルコイン消費量(改定後の通常価格・2026-10-23 ユーザー決定)。
 *
 * 1pc あたりの原価を 約 ¥0.2〜0.37 に収め(GPT 2.5 Low 1K が ¥0.31)、品質の上げ幅は
 * Low → Medium が +5、Medium → High が +15。原価は本番の長さの指示での実測(計画書 §10-2)。
 * 改定前の値・公開記念キャンペーンの値・切り替えの日時は `percoin-costs.ts` が持つ。
 */
export const NANO_BANANA_2_1_PERCOIN_COSTS = {
  "gemini-nano-banana-2.1-minimal-1k": 20,
  "gemini-nano-banana-2.1-minimal-2k": 30,
  "gemini-nano-banana-2.1-minimal-4k": 60,
  "gemini-nano-banana-2.1-medium-1k": 25,
  "gemini-nano-banana-2.1-medium-2k": 35,
  "gemini-nano-banana-2.1-medium-4k": 65,
  "gemini-nano-banana-2.1-high-1k": 40,
  "gemini-nano-banana-2.1-high-2k": 50,
  "gemini-nano-banana-2.1-high-4k": 80,
} as const satisfies Record<NanoBanana21CanonicalModel, number>;
