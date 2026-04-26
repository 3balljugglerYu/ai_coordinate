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
