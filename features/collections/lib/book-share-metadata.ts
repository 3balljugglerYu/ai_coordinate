/**
 * book 完走ビュー(`/m/[token]/book`)のシェア文言。
 *
 * book 表示は旅行日記だけのものではなくなった(ファッション雑誌など、
 * `completion_view_mode='book'` のカテゴリが増える)。文言を固定にすると、
 * 雑誌をシェアしても OGP / X カードに「旅行日記」と出てしまうため、
 * カテゴリの表示名から組み立てる。
 */
export function buildBookShareDescription(
  displayNameJa: string | null | undefined
): string {
  const name = displayNameJa?.trim();
  // 表示名をそのまま使う。接頭辞は付けない ——
  // 実データの表示名には既に「うちの子の」が含まれており
  // (「うちの子のファッション雑誌：夏」「🇮🇹 うちの子のイタリア旅行日記」)、
  // 足すと「うちの子のうちの子の…」と二重になる。
  return name
    ? `${name}。あなたのうちの子でも作れます。`
    : "Persta.AI のコレクション作品です。";
}

/** book が取得できないときのタイトル。企画名に依存しない中立な表記にする。 */
export const BOOK_SHARE_FALLBACK_TITLE = "コレクション | Persta.AI";
