/**
 * モデル選択 UI に添える「チップ（バッジ）」の定義。
 *
 * 2 系統のチップを扱う:
 *   - engine: 「どの生成エンジンか」を表す（OpenAI / Gemini）。
 *     生成モデルの 1 段目セレクター（ChatGPT / Nano Banana 2 / Nano Banana Pro）に添える。
 *   - tier: 「コスト / 品質のどの位置づけか」を表す（Low / Medium / High）。
 *     ChatGPT を選んだときに出る「生成タイプ」セレクターの行に添える。
 *
 * 表示色などのスタイルは `MODEL_TAG_DISPLAY` に集約。i18n キーは `coordinate` 名前空間。
 */

export type ModelTagKey =
  | "engineOpenai"
  | "engineGemini"
  | "tierLight"
  | "tierBalanced"
  | "tierQuality";

/** `messages.<locale>.coordinate` の中の、チップ用ラベルキー */
export type ModelTagMessageKey =
  | "modelTagEngineOpenai"
  | "modelTagEngineGemini"
  | "modelTagTierLight"
  | "modelTagTierBalanced"
  | "modelTagTierQuality";

export interface ModelTagDisplay {
  messageKey: ModelTagMessageKey;
  /**
   * `<Badge>` に渡す追加クラス（色味）。`Badge` の default variant が付ける
   * `bg-*` / `text-*` / `border-*` は tailwind-merge により後勝ちで上書きされる。
   */
  className: string;
}

export const MODEL_TAG_DISPLAY: Record<ModelTagKey, ModelTagDisplay> = {
  engineOpenai: {
    messageKey: "modelTagEngineOpenai",
    className:
      "border-slate-300 bg-transparent text-slate-700 dark:border-slate-600 dark:text-slate-300",
  },
  engineGemini: {
    messageKey: "modelTagEngineGemini",
    className:
      "border-sky-300 bg-transparent text-sky-700 dark:border-sky-700 dark:text-sky-300",
  },
  tierLight: {
    messageKey: "modelTagTierLight",
    className:
      "border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  tierBalanced: {
    messageKey: "modelTagTierBalanced",
    className:
      "border-transparent bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  },
  tierQuality: {
    messageKey: "modelTagTierQuality",
    className:
      "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  },
};

/**
 * 正規モデル ID から「品質ポジション」用の tier チップを返す（最大 1 個）。
 * 生成タイプセレクター（Low/Medium/High）や、生成結果一覧の品質表示に使う。
 *
 * 注意: 1 段目の生成モデルセレクター（ChatGPT / Nano Banana 2 / Nano Banana Pro）には
 * tier ではなく engine チップを添える。それぞれのチップは UI 側で固定値として渡す。
 */
export function getModelTagsForCanonicalModel(
  model: string | null | undefined,
): ModelTagKey[] {
  if (typeof model !== "string" || model.length === 0) {
    return [];
  }
  if (model.startsWith("gpt-image-2-low")) {
    return ["tierLight"];
  }
  if (model.startsWith("gpt-image-2-medium")) {
    return ["tierBalanced"];
  }
  if (model.startsWith("gpt-image-2-high")) {
    return ["tierQuality"];
  }
  if (model.startsWith("gemini-3-pro-image-")) {
    return ["tierQuality"];
  }
  if (model === "gemini-3.1-flash-image-preview-512") {
    return ["tierLight"];
  }
  if (model === "gemini-3.1-flash-image-preview-1024") {
    return ["tierBalanced"];
  }
  if (
    model.startsWith("gemini-3.1-flash-image-") ||
    model === "gemini-2.5-flash-image"
  ) {
    return ["tierLight"];
  }
  return [];
}
