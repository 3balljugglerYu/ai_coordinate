/**
 * /style のユーザープロンプト入力欄を「前回入力」で prefill するための
 * localStorage アクセサ。
 *
 * 記憶の単位はスコープで決まる:
 *   - preset がラベルを上書きしているスタイル → preset 単位
 *     (ラベルが違う = 入力の意味が違う。「キャラの名前」の下書きを
 *     「好きな数字」欄に prefill しないための分離)
 *   - それ以外 → 従来どおり category 単位(=ウエハース風用とちびキャラ用を
 *     混ぜない。既存キーを維持するため過去の下書きもそのまま生きる)
 *
 * 復元時は admin が後から userPromptMaxLength を縮めても安全なように slice する。
 * private mode 等で localStorage が触れないときは透過的に空 / no-op で返す。
 */

const STORAGE_KEY_PREFIX = "user-prompt:";

export interface UserPromptRecallScope {
  presetId: string;
  /** preset がラベル(user_prompt_label)を上書きしているか。true なら preset 単位で記憶する。 */
  hasPresetLabel: boolean;
  categoryKey: string;
}

function buildKey(scope: UserPromptRecallScope): string {
  return scope.hasPresetLabel
    ? `${STORAGE_KEY_PREFIX}preset:${scope.presetId}`
    : `${STORAGE_KEY_PREFIX}${scope.categoryKey}`;
}

/**
 * 指定スコープの「前回入力」を取り出す。値が無い / localStorage 不可なら "".
 * 取得後、安全のため maxLength で切り詰める(admin が後から縮めた場合の保険)。
 */
export function loadUserPromptForScope(
  scope: UserPromptRecallScope,
  maxLength: number | null | undefined,
): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem(buildKey(scope));
    if (raw === null) return "";
    const limit =
      typeof maxLength === "number" && maxLength > 0 ? maxLength : Infinity;
    return raw.slice(0, limit);
  } catch {
    return "";
  }
}

/**
 * 指定スコープに対し「submit したプロンプト」を保存する。
 * 値が空文字(trim 後) なら削除する(=「クリアして実行」が「次回も空で開く」と
 * 自然に結びつく)。private mode 等で書けなくても例外を投げない。
 */
export function saveUserPromptForScope(
  scope: UserPromptRecallScope,
  value: string,
): void {
  if (typeof window === "undefined") return;
  const trimmed = value.trim();
  try {
    if (trimmed.length > 0) {
      window.localStorage.setItem(buildKey(scope), value);
    } else {
      window.localStorage.removeItem(buildKey(scope));
    }
  } catch {
    // private mode 等で書けなくても無視
  }
}
