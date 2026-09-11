/**
 * OpenAI 画像モデル(ChatGPT Images)の family + quality + size tier 型体系。
 *
 * `shared/generation/gemini-banana-model.ts` と同じ構造で、canonical モデル ID を
 * family(API に送るモデル名)・quality・size tier の 3 軸から一意に組み立てる。
 *
 *   family × quality × size tier
 *     gpt-image-2          × low / medium / high × 1k / 2k / 4k  (9 値)
 *     gpt-image-2.5-flare  × low / medium / high × 1k / 2k / 4k  (9 値)
 *
 * canonical ID は `${family}-${quality}-${sizeTier}`(例: `gpt-image-2.5-flare-low-1k`)。
 * family 名にハイフンとドットを含むため、文字列を `split("-")` して位置で取り出す
 * 実装は成り立たない(2.5 だと 3 番目が `"flare"` になる)。復元は canonical の
 * 集合への所属確認 + 明示的なマッピング表で行う。
 */

export const GPT_IMAGE_2_LEGACY_LOW_MODEL = "gpt-image-2-low" as const;

/**
 * OpenAI images API に `model` として送る名前 = family。
 * 2.5 は flare(速度・編集重視)のみ導入し、sunburst は見送り(計画書 §0 / ADR-006)。
 */
export const OPENAI_IMAGE_FAMILIES = [
  "gpt-image-2",
  "gpt-image-2.5-flare",
] as const;
export type OpenAIImageFamily = (typeof OPENAI_IMAGE_FAMILIES)[number];

// quality / size tier の 2 軸は family を問わず共通(2.5 も 3 段 × 3 tier のまま。
// API 上の xhigh / max は出さない)。型名は歴史的経緯で GptImage2 のまま。
export const GPT_IMAGE_2_QUALITIES = ["low", "medium", "high"] as const;
export type GptImage2Quality = (typeof GPT_IMAGE_2_QUALITIES)[number];

export const GPT_IMAGE_2_SIZE_TIERS = ["1k", "2k", "4k"] as const;
export type GptImage2SizeTier = (typeof GPT_IMAGE_2_SIZE_TIERS)[number];

export type GptImage2CanonicalModel =
  `gpt-image-2-${GptImage2Quality}-${GptImage2SizeTier}`;
export type GptImage25FlareCanonicalModel =
  `gpt-image-2.5-flare-${GptImage2Quality}-${GptImage2SizeTier}`;
export type OpenAIImageCanonicalModel =
  | GptImage2CanonicalModel
  | GptImage25FlareCanonicalModel;

export function composeOpenAIImageModel(
  family: OpenAIImageFamily,
  quality: GptImage2Quality,
  sizeTier: GptImage2SizeTier
): OpenAIImageCanonicalModel {
  return `${family}-${quality}-${sizeTier}`;
}

function listCanonicalModelsForFamily<F extends OpenAIImageFamily>(
  family: F
): ReadonlyArray<`${F}-${GptImage2Quality}-${GptImage2SizeTier}`> {
  return GPT_IMAGE_2_QUALITIES.flatMap((quality) =>
    GPT_IMAGE_2_SIZE_TIERS.map(
      (sizeTier) => `${family}-${quality}-${sizeTier}` as const
    )
  );
}

export const GPT_IMAGE_2_CANONICAL_MODELS: ReadonlyArray<GptImage2CanonicalModel> =
  listCanonicalModelsForFamily("gpt-image-2");

export const GPT_IMAGE_2_5_FLARE_CANONICAL_MODELS: ReadonlyArray<GptImage25FlareCanonicalModel> =
  listCanonicalModelsForFamily("gpt-image-2.5-flare");

/** 全 family の canonical(18 値)。DB の CHECK 制約・KNOWN_MODEL_INPUTS の展開元。 */
export const OPENAI_IMAGE_CANONICAL_MODELS: ReadonlyArray<OpenAIImageCanonicalModel> =
  [...GPT_IMAGE_2_CANONICAL_MODELS, ...GPT_IMAGE_2_5_FLARE_CANONICAL_MODELS];

/**
 * legacy alias `gpt-image-2-low` の正規化先。2.0 の最小構成。
 *
 * ⚠️ ここは「既定で選ばれるモデル」ではない。既定は
 * `DEFAULT_GENERATION_MODEL`(features/generation/types.ts)を見ること。
 */
export const DEFAULT_GPT_IMAGE_2_MODEL =
  "gpt-image-2-low-1k" satisfies GptImage2CanonicalModel;

/** ChatGPT Images 2.5 の最小構成。2026-09-11 から全画面の既定。 */
export const DEFAULT_GPT_IMAGE_2_5_FLARE_MODEL =
  "gpt-image-2.5-flare-low-1k" satisfies GptImage25FlareCanonicalModel;

/**
 * モデルごとのペルコイン消費量。
 *
 * 2.5 は検証期間中 2.0 と同額に揃える(計画書 §0 の合意事項)。差を付けるときは
 * ここだけを変えれば API・worker・UI の表示がすべて追従する。
 */
export const OPENAI_IMAGE_PERCOIN_COSTS = {
  // --- gpt-image-2 ---
  "gpt-image-2-low-1k": 10,
  "gpt-image-2-low-2k": 20,
  "gpt-image-2-low-4k": 40,
  "gpt-image-2-medium-1k": 20,
  "gpt-image-2-medium-2k": 50,
  "gpt-image-2-medium-4k": 80,
  "gpt-image-2-high-1k": 50,
  "gpt-image-2-high-2k": 80,
  "gpt-image-2-high-4k": 130,
  // --- gpt-image-2.5-flare(2.0 と同額)---
  "gpt-image-2.5-flare-low-1k": 10,
  "gpt-image-2.5-flare-low-2k": 20,
  "gpt-image-2.5-flare-low-4k": 40,
  "gpt-image-2.5-flare-medium-1k": 20,
  "gpt-image-2.5-flare-medium-2k": 50,
  "gpt-image-2.5-flare-medium-4k": 80,
  "gpt-image-2.5-flare-high-1k": 50,
  "gpt-image-2.5-flare-high-2k": 80,
  "gpt-image-2.5-flare-high-4k": 130,
} as const satisfies Record<OpenAIImageCanonicalModel, number>;

export interface ParsedOpenAIImageModel {
  canonical: OpenAIImageCanonicalModel;
  family: OpenAIImageFamily;
  quality: GptImage2Quality;
  sizeTier: GptImage2SizeTier;
}

/**
 * canonical → 分解結果の明示的なマッピング表。compose で組み立てた値をキーにするので
 * canonical の命名規則が変わってもここが自動で追従し、文字列の位置解析に依存しない。
 */
const OPENAI_IMAGE_CANONICAL_MAP: ReadonlyMap<string, ParsedOpenAIImageModel> =
  new Map(
    OPENAI_IMAGE_FAMILIES.flatMap((family) =>
      GPT_IMAGE_2_QUALITIES.flatMap((quality) =>
        GPT_IMAGE_2_SIZE_TIERS.map((sizeTier) => {
          const canonical = composeOpenAIImageModel(family, quality, sizeTier);
          return [canonical, { canonical, family, quality, sizeTier }] as const;
        })
      )
    )
  );

export function isOpenAIImageCanonicalModel(
  value: unknown
): value is OpenAIImageCanonicalModel {
  return typeof value === "string" && OPENAI_IMAGE_CANONICAL_MAP.has(value);
}

function normalizeLegacyGptImage2Model(value: string): string {
  return value === GPT_IMAGE_2_LEGACY_LOW_MODEL
    ? DEFAULT_GPT_IMAGE_2_MODEL
    : value;
}

/**
 * canonical モデル ID(または legacy `gpt-image-2-low`)から family / quality /
 * sizeTier を復元する。OpenAI 系以外・未知の文字列・null は null を返す。
 */
export function parseOpenAIImageModel(
  value: string | null | undefined
): ParsedOpenAIImageModel | null {
  if (typeof value !== "string") {
    return null;
  }
  return OPENAI_IMAGE_CANONICAL_MAP.get(normalizeLegacyGptImage2Model(value)) ?? null;
}

/**
 * `gpt-image-2.5-flare` family のモデルか。
 *
 * 段階公開ゲート(REQ-006 / REQ-014)の判定に使う。canonical(と legacy alias)以外
 * (未知の文字列・Gemini 系・null)は false。`startsWith("gpt-image-2")` は 2.5 にも
 * 一致するため、family の判定は必ずこの parser 経由にする(ADR-002)。
 */
export function isGptImage25FlareModel(
  model: string | null | undefined
): boolean {
  return parseOpenAIImageModel(model)?.family === "gpt-image-2.5-flare";
}

/**
 * OpenAI images API の `model` フィールドに送る名前。
 * 現状は family 文字列そのものだが、API 側の改名に canonical を巻き込まないよう
 * 対応表として持つ。
 */
const OPENAI_IMAGE_API_MODEL_NAMES = {
  "gpt-image-2": "gpt-image-2",
  "gpt-image-2.5-flare": "gpt-image-2.5-flare",
} as const satisfies Record<OpenAIImageFamily, string>;

export type OpenAIImageApiModelName =
  (typeof OPENAI_IMAGE_API_MODEL_NAMES)[OpenAIImageFamily];

export function toOpenAIApiModelName(
  family: OpenAIImageFamily
): OpenAIImageApiModelName {
  return OPENAI_IMAGE_API_MODEL_NAMES[family];
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
