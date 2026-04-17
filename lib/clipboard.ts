/**
 * モバイル・デスクトップ両対応のクリップボードコピーユーティリティ
 *
 * navigator.clipboard.writeText はSecure Context（HTTPS or localhost）でのみ動作するため、
 * 非HTTPS環境やモバイルブラウザでは textarea + execCommand をフォールバックとして使用する。
 */

function copyViaExecCommand(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  // iOS Safari では setSelectionRange が必要
  textarea.setSelectionRange(0, textarea.value.length);
  const result = document.execCommand("copy");
  document.body.removeChild(textarea);
  return result;
}

/**
 * テキストをクリップボードにコピーする。
 * Clipboard API を優先し、失敗時は execCommand にフォールバックする。
 * @throws コピーに失敗した場合
 */
export async function copyTextToClipboard(text: string): Promise<void> {
  // 1) Clipboard API を試行
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Secure Context 外などで失敗 → フォールバックへ
    }
  }

  // 2) execCommand フォールバック（モバイル・HTTP環境両対応）
  if (copyViaExecCommand(text)) {
    return;
  }

  throw new Error("Failed to copy to clipboard");
}
