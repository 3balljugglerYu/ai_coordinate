/**
 * /style のユーザープロンプト入力欄を「前回入力」で prefill するための
 * localStorage アクセサ。category 単位で覚える(=ウエハース風用とちびキャラ用
 * を混ぜない)。
 *
 * 復元時は admin が後から userPromptMaxLength を縮めても安全なように slice する。
 * private mode 等で localStorage が触れないときは透過的に空 / no-op で返す。
 */

const STORAGE_KEY_PREFIX = "user-prompt:";

function buildKey(categoryKey: string): string {
  return `${STORAGE_KEY_PREFIX}${categoryKey}`;
}

/**
 * 指定 category の「前回入力」を取り出す。値が無い / localStorage 不可なら "".
 * 取得後、安全のため maxLength で切り詰める(admin が後から縮めた場合の保険)。
 */
export function loadUserPromptForCategory(
  categoryKey: string,
  maxLength: number | null | undefined,
): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem(buildKey(categoryKey));
    if (raw === null) return "";
    const limit =
      typeof maxLength === "number" && maxLength > 0 ? maxLength : Infinity;
    return raw.slice(0, limit);
  } catch {
    return "";
  }
}

/**
 * 指定 category に対し「submit したプロンプト」を保存する。
 * 値が空文字(trim 後) なら削除する(=「クリアして実行」が「次回も空で開く」と
 * 自然に結びつく)。private mode 等で書けなくても例外を投げない。
 */
export function saveUserPromptForCategory(
  categoryKey: string,
  value: string,
): void {
  if (typeof window === "undefined") return;
  const trimmed = value.trim();
  try {
    if (trimmed.length > 0) {
      window.localStorage.setItem(buildKey(categoryKey), value);
    } else {
      window.localStorage.removeItem(buildKey(categoryKey));
    }
  } catch {
    // private mode 等で書けなくても無視
  }
}
