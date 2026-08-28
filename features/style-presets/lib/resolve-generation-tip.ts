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

  /*
    片方の言語だけ書かれている場合の受け皿。英語ロケールで英語が無いなら
    日本語を出す（何も出ないより、読める人には情報が届く方がよい）。
  */
  const fallback = useEnglish
    ? preset.generationTipJa ?? preset.category.generationTipJa
    : preset.generationTipEn ?? preset.category.generationTipEn;

  return fallback && fallback.trim().length > 0 ? fallback : null;
}
