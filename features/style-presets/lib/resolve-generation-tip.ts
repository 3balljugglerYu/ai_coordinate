/**
 * 生成画面に出す「ワンポイントアドバイス」の解決。
 *
 * ユーザープロンプト入力欄と同じ 2 段フォールバック: プリセット設定 → カテゴリ設定。
 * どちらも空なら出さない（既定文言は持たない。運営が書いたときだけ出るもの）。
 *
 * 既にある `userGuidanceJa`（スタイル画像カードの ⓘ ツールチップ）とは別物。
 * あちらは「どんな画像を入れるとよいか」、こちらは「生成の操作の助言」で、
 * 出す場所も読ませ方も違う。
 */

interface GenerationTipSource {
  generationTipJa?: string | null;
  generationTipEn?: string | null;
  category: {
    generationTipJa?: string | null;
    generationTipEn?: string | null;
  };
}

/**
 * @param locale "en" のときだけ英語を使う。他ロケールは日本語へ倒す
 *   （既存の userGuidance と同じ扱い）
 * @returns 表示する文言。無ければ null
 *
 * ⚠️ フォールバックは **英語ロケールのときだけ**（英語が無ければ日本語を出す）。
 * 逆向き（日本語ロケールで英語を出す）はしない。呼び出し側は ko/th/hi/ar なども
 * まとめて "ja" として渡すため、逆向きを許すと「英語欄だけ書いた設定」が
 * 日本語・韓国語・タイ語の画面に英語のまま出てしまう。
 * 日本語欄が空なのは、その読者向けの文言をまだ書いていないという意味に取る。
 */
export function resolveGenerationTip(
  preset: GenerationTipSource,
  locale: string
): string | null {
  const useEnglish = locale === "en";

  const presetTip = useEnglish
    ? preset.generationTipEn
    : preset.generationTipJa;
  if (presetTip && presetTip.trim().length > 0) {
    return presetTip;
  }

  const categoryTip = useEnglish
    ? preset.category.generationTipEn
    : preset.category.generationTipJa;
  if (categoryTip && categoryTip.trim().length > 0) {
    return categoryTip;
  }

  if (!useEnglish) {
    return null;
  }

  /*
    英語ロケールで英語が書かれていないときだけ、日本語を出す。
    アプリの第一言語が日本語で、日本語欄はほぼ必ず埋まっているため、
    「英語話者には何も出ない」より読める形にしておく。
  */
  const japaneseFallback =
    preset.generationTipJa ?? preset.category.generationTipJa;

  return japaneseFallback && japaneseFallback.trim().length > 0
    ? japaneseFallback
    : null;
}
