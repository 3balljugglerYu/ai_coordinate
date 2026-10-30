/**
 * 見本の画面で「一度見せたら二度と出さない」ものの印を、この端末(localStorage)に持つ。
 * - 「先行公開」の案内を見たか
 * - 「使える見本・使えない見本」に同意したか(上げるのに失敗して見本の行ができなくても、次からは出さない)
 * 見本を前に上げたことがある人には、どちらもそもそも出さない(そちらはサーバーで確かめる)
 */
const INTRO_SEEN_KEY = "persta:catalog-reference-intro-seen-v1";
const CONSENT_GIVEN_KEY = "persta:catalog-reference-consent-given-v1";

/** 読めないときは fallback を返す */
function readFlag(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return fallback;
  }
}

function writeFlag(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // localStorage が使えなくても困らない。この画面のあいだは状態で覚えている
  }
}

/** 読めないときは「見た」扱い(安全側)にし、繰り返し出さない */
export function hasSeenCatalogReferenceIntro(): boolean {
  return readFlag(INTRO_SEEN_KEY, true);
}

export function markCatalogReferenceIntroSeen(): void {
  writeFlag(INTRO_SEEN_KEY);
}

/** 読めないときは「まだ」扱い(同意の画面をもう一度出す。安全側) */
export function hasGivenCatalogReferenceConsent(): boolean {
  return readFlag(CONSENT_GIVEN_KEY, false);
}

export function markCatalogReferenceConsentGiven(): void {
  writeFlag(CONSENT_GIVEN_KEY);
}
