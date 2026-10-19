/** @jest-environment node */

import { escapeCsvCell } from "@/lib/csv/escape-csv-cell";

describe("escapeCsvCell", () => {
  test("ふつうの値はそのまま・空は空文字", () => {
    expect(escapeCsvCell("HBS-7F3K")).toBe("HBS-7F3K");
    expect(escapeCsvCell(12)).toBe("12");
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });

  test("区切り・引用符・改行を含むと引用符で囲む", () => {
    expect(escapeCsvCell('a,"b"')).toBe('"a,""b"""');
    expect(escapeCsvCell("a\nb")).toBe('"a\nb"');
  });

  test.each([["=1+1"], ["+1"], ["-1"], ["@SUM(A1)"], ["\tx"]])(
    "数式として動く先頭(%s)には ' を付ける",
    (value) => {
      expect(escapeCsvCell(value).startsWith("'")).toBe(true);
    }
  );
});
