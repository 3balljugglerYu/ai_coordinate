/**
 * モバイル対応のクリップボードコピーユーティリティ
 *
 * モバイルブラウザ（Android Chrome, iOS Safari, アプリ内WebView等）では
 * navigator.clipboard.writeText がURLエンコードされたテキストをコピーする
 * 不具合があるため、モバイルでは textarea + execCommand を優先使用する。
 */

function isMobileBrowser(): boolean {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

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
 * モバイルでは execCommand を優先し、デスクトップでは Clipboard API を使用する。
 * @throws コピーに失敗した場合
 */
export async function copyTextToClipboard(text: string): Promise<void> {
  let copied = false;

  if (isMobileBrowser()) {
    copied = copyViaExecCommand(text);
  }

  if (!copied && navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    copied = true;
  }

  if (!copied) {
    throw new Error("Failed to copy prompt");
  }
}
