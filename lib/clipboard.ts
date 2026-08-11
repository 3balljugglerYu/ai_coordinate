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

/**
 * 「押してから通信でテキストを取ってコピーする」ためのコピー。
 *
 * iOS Safari は `await` を挟むとユーザー操作の権限が切れ、その後の
 * `clipboard.writeText` が拒否される。textarea + execCommand のフォールバックも
 * 権限が切れた後では効かないため、通信してから copyTextToClipboard を呼ぶ形だと
 * iOS では必ず失敗する（同期的にテキストを持っている他のコピーは動く）。
 *
 * `ClipboardItem` には **Promise を渡せる**。こうすると中身が後から解決しても
 * 押した瞬間の権限が保たれる。Safari が用意している正攻法。
 *
 * **クリックハンドラから同期的に呼ぶこと**（先に await すると意味がない）。
 *
 * @param textPromise コピーするテキストの Promise
 * @throws テキストの取得に失敗した場合、またはコピーできなかった場合
 */
export async function copyTextFromPromise(
  textPromise: Promise<string>
): Promise<void> {
  if (
    typeof ClipboardItem !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.write === "function"
  ) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": textPromise.then(
            (text) => new Blob([text], { type: "text/plain" })
          ),
        }),
      ]);
      return;
    } catch {
      // 未対応・拒否された場合は従来経路へ倒す
    }
  }

  await copyTextToClipboard(await textPromise);
}
