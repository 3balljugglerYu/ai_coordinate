const CSV_FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/**
 * CSV の1セルを書き出す。区切り・引用符・改行を含むなら引用符で囲み、
 * 表計算ソフトで数式として動く先頭文字(= + - @ タブ 改行)の前には ' を付ける。
 * (ボーナス一括付与 BulkGrantClient.tsx と同じ規則)
 */
export function escapeCsvCell(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? "" : String(value);
  const needsQuote =
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r");
  let escaped = str.replace(/"/g, '""');
  if (CSV_FORMULA_TRIGGER.test(str)) {
    escaped = "'" + escaped;
  }
  return needsQuote ? `"${escaped}"` : escaped;
}
