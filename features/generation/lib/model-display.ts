/**
 * モデル ID（DB 保存値）からユーザー向けブランド名を導出するヘルパー。
 *
 * Post 詳細画面の生成モデル表示などで使用する。新規モデル追加時は
 * `startsWith` 判定を 1 行足すだけで対応できるよう、マッピングテーブルではなく
 * プレフィックス判定で実装している。
 *
 * 未知モデル ID や null 入力では null を返す。呼び出し側はこの場合、
 * モデル名ブロックを描画しない（ADR-002）。
 */
export function getModelBrandName(
  model: string | null | undefined,
): string | null {
  if (typeof model !== "string" || model.length === 0) {
    return null;
  }
  if (model.startsWith("gpt-image-")) {
    return "ChatGPT Images 2.0";
  }
  if (model.startsWith("gemini-3-pro-image-")) {
    return "Nano Banana Pro";
  }
  if (
    model.startsWith("gemini-3.1-flash-image-") ||
    model === "gemini-2.5-flash-image"
  ) {
    return "Nano Banana 2";
  }
  return null;
}

/**
 * 生成結果一覧（リスト表示）で使うモデル別の細分化ラベルとデフォルト解像度。
 * 生成行に width / height が無い旧レコードでも、DB の `model` 値だけで
 * 妥当なサイズチップを表示できるよう defaultSize を持たせている。
 */
export interface ModelDisplayInfo {
  displayName: string;
  defaultSize: { width: number; height: number };
}

const MODEL_LIST_DISPLAY_MAP: Record<string, ModelDisplayInfo> = {
  "gpt-image-2-low": {
    displayName: "ChatGPT Images 2.0",
    defaultSize: { width: 1024, height: 1024 },
  },
  "gemini-2.5-flash-image": {
    displayName: "Nano Banana 2",
    defaultSize: { width: 1024, height: 1024 },
  },
  "gemini-3.1-flash-image-preview-512": {
    displayName: "Nano Banana 2 | 0.5K",
    defaultSize: { width: 512, height: 512 },
  },
  "gemini-3.1-flash-image-preview-1024": {
    displayName: "Nano Banana 2 | 1K",
    defaultSize: { width: 1024, height: 1024 },
  },
  "gemini-3-pro-image-1k": {
    displayName: "Nano Banana Pro | 1K",
    defaultSize: { width: 1024, height: 1024 },
  },
  "gemini-3-pro-image-2k": {
    displayName: "Nano Banana Pro | 2K",
    defaultSize: { width: 2048, height: 2048 },
  },
  "gemini-3-pro-image-4k": {
    displayName: "Nano Banana Pro | 4K",
    defaultSize: { width: 4096, height: 4096 },
  },
};

const FALLBACK_DISPLAY: ModelDisplayInfo = {
  displayName: "AI モデル",
  defaultSize: { width: 1024, height: 1024 },
};

export function getModelDisplayInfo(
  model: string | null | undefined,
): ModelDisplayInfo {
  if (!model) return FALLBACK_DISPLAY;
  return MODEL_LIST_DISPLAY_MAP[model] ?? FALLBACK_DISPLAY;
}

export function formatImageSize(
  width: number | null | undefined,
  height: number | null | undefined,
  fallback: { width: number; height: number },
): string {
  const w = typeof width === "number" && width > 0 ? width : fallback.width;
  const h = typeof height === "number" && height > 0 ? height : fallback.height;
  return `${w}×${h}`;
}
