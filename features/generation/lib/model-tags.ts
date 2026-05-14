/**
 * モデル選択 UI に添える「チップ（バッジ）」の定義。
 *
 * モデル名そのものは変えず、「コスト / 品質ポジション」を一目で伝えるための
 * 小さな色付きラベル（Low / Medium / High）を添える。Gemini 系を表に出すときも、
 * `getModelTagsForCanonicalModel` に分岐を 1 行足すだけで対応できる設計にしている。
 *
 * 表示色などのスタイルは `MODEL_TAG_DISPLAY` に集約。i18n キーは `coordinate` 名前空間。
 */

export type ModelTagKey = "tierLight" | "tierBalanced" | "tierQuality";

/** `messages.<locale>.coordinate` の中の、チップ用ラベルキー */
export type ModelTagMessageKey =
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
 * 正規モデル ID（DB 保存値 / 生成リクエスト値）から、表示すべきチップ一覧を返す。
 * 未知 ID では空配列。チップは「コスト・品質ポジション」の 1 個（Low / Medium / High）。
 *
 * 判定はより具体的なプレフィックスを先に書くこと（順序依存）。
 */
export function getModelTagsForCanonicalModel(
  model: string | null | undefined,
): ModelTagKey[] {
  if (typeof model !== "string" || model.length === 0) {
    return [];
  }
  // OpenAI: ChatGPT Images 2.0 — quality でポジションが決まる（size tier は無関係）
  if (model.startsWith("gpt-image-2-low")) {
    return ["tierLight"];
  }
  if (model.startsWith("gpt-image-2-medium")) {
    return ["tierBalanced"];
  }
  if (model.startsWith("gpt-image-2-high")) {
    return ["tierQuality"];
  }
  // Google (現在は非表示): Nano Banana Pro は高精細、flash 系は解像度で軽量 / 標準
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
