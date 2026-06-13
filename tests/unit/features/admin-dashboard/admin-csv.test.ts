import {
  DASHBOARD_TREND_CSV_HEADERS,
  ONE_TAP_STYLE_TREND_CSV_HEADERS,
  buildDashboardTrendCsv,
  buildOneTapStyleTrendCsv,
  csvDateSpanSuffix,
  escapeCsvField,
  toCsvString,
} from "@/features/admin-dashboard/lib/admin-csv";

describe("admin-csv", () => {
  test("escapeCsvField はカンマ/引用符/改行を含む値だけ引用符で囲む", () => {
    expect(escapeCsvField("abc")).toBe("abc");
    expect(escapeCsvField("a,b")).toBe('"a,b"');
    expect(escapeCsvField('a"b')).toBe('"a""b"');
    expect(escapeCsvField("a\nb")).toBe('"a\nb"');
  });

  test("toCsvString はヘッダー + 行を CRLF で結合する", () => {
    expect(
      toCsvString(
        ["x", "y"],
        [
          [1, 2],
          ["a", "b,c"],
        ],
      ),
    ).toBe('x,y\r\n1,2\r\na,"b,c"');
  });

  test("csvDateSpanSuffix は空配列で all、それ以外は最初_最後", () => {
    expect(csvDateSpanSuffix([])).toBe("all");
    expect(csvDateSpanSuffix(["2026-06-06", "2026-06-07", "2026-06-13"])).toBe(
      "2026-06-06_2026-06-13",
    );
  });

  test("buildDashboardTrendCsv: 日付/新規登録/生成完了", () => {
    const csv = buildDashboardTrendCsv([
      { bucket: "2026-06-10", label: "6/10", signups: 5, generations: 12 },
    ]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(DASHBOARD_TREND_CSV_HEADERS.join(","));
    expect(lines[1]).toBe("2026-06-10,5,12");
  });

  test("buildOneTapStyleTrendCsv: 訪問/生成/登録/保存の各指標", () => {
    const csv = buildOneTapStyleTrendCsv([
      {
        bucket: "2026-06-10",
        label: "6/10",
        visits: 100,
        generations: 40,
        signupClicks: 9,
        signupCompletions: 3,
        wardrobeSaveClicks: 7,
        wardrobeSaveCompletions: 2,
      },
    ]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(ONE_TAP_STYLE_TREND_CSV_HEADERS.join(","));
    expect(lines[1]).toBe("2026-06-10,100,40,9,3,7,2");
  });
});
