/**
 * 注目ページ（名指しで追いかけるページ）の取得。
 *
 * ⭐ Top Pages は上位8件しか出さないので、新設ページはまず入らない。
 * 「見たいページだけ見えない」を避けるための別枠。
 */

const runReportMock = jest.fn();

jest.mock("@/features/analytics/lib/ga4-client", () => ({
  getGa4Client: () => ({ runReport: runReportMock }),
}));

jest.mock("@/lib/env", () => ({
  env: { GA4_PROPERTY_ID: "123456" },
}));

import {
  WATCHLIST_PAGES,
  getGa4WatchlistPages,
} from "@/features/analytics/lib/get-ga4-watchlist-pages";

/** GA4 の runReport が返す形。 */
function reportOf(rows: Array<[string, number, number]>) {
  return [
    {
      rows: rows.map(([path, views, users]) => ({
        dimensionValues: [{ value: path }],
        metricValues: [{ value: String(views) }, { value: String(users) }],
      })),
    },
  ];
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getGa4WatchlistPages", () => {
  test("指定したページの数字を返す", async () => {
    runReportMock.mockResolvedValue(reportOf([["/use-prompts", 33, 6]]));

    const result = await getGa4WatchlistPages("30d");

    expect(result.status).toBe("ready");
    const row = result.rows.find((r) => r.path === "/use-prompts");
    expect(row).toMatchObject({ views: 33, activeUsers: 6 });
  });

  /**
   * ⭐ GA4 は数字が付かないページを返さない。返ってきたものだけを並べると、
   * 「まだ誰も来ていない」と「集計に失敗した」が見分けられなくなる。
   */
  test("⭐数字が付かなかったページも 0 として行に残す", async () => {
    runReportMock.mockResolvedValue(reportOf([["/use-prompts", 33, 6]]));

    const result = await getGa4WatchlistPages("30d");

    expect(result.rows).toHaveLength(WATCHLIST_PAGES.length);
    for (const page of WATCHLIST_PAGES) {
      expect(result.rows.some((r) => r.path === page.path)).toBe(true);
    }
    const zero = result.rows.find((r) => r.path !== "/use-prompts");
    expect(zero?.views).toBe(0);
  });

  test("並び順は WATCHLIST_PAGES のまま（GA4 の返却順に振り回されない）", async () => {
    const reversed = [...WATCHLIST_PAGES]
      .reverse()
      .map((p, i) => [p.path, i + 1, 1] as [string, number, number]);
    runReportMock.mockResolvedValue(reportOf(reversed));

    const result = await getGa4WatchlistPages("30d");

    expect(result.rows.map((r) => r.path)).toEqual(
      WATCHLIST_PAGES.map((p) => p.path)
    );
  });

  test("見出しは pagePath ではなくラベルを使う", async () => {
    runReportMock.mockResolvedValue(reportOf([]));

    const result = await getGa4WatchlistPages("30d");

    expect(result.rows[0].title).toBe(WATCHLIST_PAGES[0].label);
  });

  test("指定したページだけを問い合わせる（全ページを引かない）", async () => {
    runReportMock.mockResolvedValue(reportOf([]));

    await getGa4WatchlistPages("30d");

    const args = runReportMock.mock.calls[0][0];
    expect(args.dimensionFilter.filter.fieldName).toBe("pagePath");
    expect(args.dimensionFilter.filter.inListFilter.values).toEqual(
      WATCHLIST_PAGES.map((p) => p.path)
    );
  });

  /**
   * ⭐ ここが落ちても他のカードを道連れにしない。
   * 失敗を 0 として表示すると「誰も来ていない」と読めてしまう。
   */
  test("⭐取得に失敗したら error にする（0 件として見せない）", async () => {
    runReportMock.mockRejectedValue(new Error("boom"));

    const result = await getGa4WatchlistPages("30d");

    expect(result.status).toBe("error");
    expect(result.rows).toEqual([]);
  });
});
