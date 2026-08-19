/**
 * 「0」と「計測していない」を区別する判定。
 *
 * 計装は指標ごとに別々の日に入った。計装前の期間を集計すると行が無いので 0 が出るが、
 * それは「0件だった」ではなく「取れていない」。この2つが画面上で同じ見た目だった。
 *
 * 実害: 神コレクション(2026-06-10 開始)のシェアは企画への紐づけが 2026-06-13 開始で、
 * 最初の3日ぶんが数えられていない。それを知らずにファッション雑誌企画のシェア数と
 * 並べると比較が成立しない。
 */

import {
  COLLECTION_METRIC_INSTRUMENTED_SINCE,
  describeMetricAvailability,
  resolveMetricAvailability,
} from "@/features/admin-dashboard/lib/collection-metric-availability";

// ファッション雑誌企画の会期(preset_categories の表示期間そのもの)
const FASHION_START = "2026-08-08T10:00:00.000Z";
const FASHION_END = "2026-08-16T13:00:00.000Z";
// 神コレクションの会期
const WAFER_START = "2026-06-13T11:00:00.000Z";
const WAFER_END = "2026-06-21T13:00:00.000Z";
// 豪州企画(訪問計装の後に始まった)
const AUSTRALIA_START = "2026-08-16T23:00:00.000Z";
const AUSTRALIA_END = "2026-09-06T12:59:00.000Z";

describe("resolveMetricAvailability", () => {
  test("計装開始日を持たない指標は常に available", () => {
    expect(
      resolveMetricAvailability("seriesGenerations", WAFER_START, WAFER_END),
    ).toEqual({ status: "available", instrumentedSince: null });
  });

  /*
    ファッション雑誌企画(〜8/16)は訪問計装(8/17)より前に終わっている。
    ここで 0 を出すと「訪問ゼロだった」と読まれる。
  */
  test("⭐会期が丸ごと計装前なら unavailable", () => {
    const result = resolveMetricAvailability(
      "visitsMember",
      FASHION_START,
      FASHION_END,
    );

    expect(result.status).toBe("unavailable");
    expect(result.instrumentedSince).toBe(
      COLLECTION_METRIC_INSTRUMENTED_SINCE.visitsMember,
    );
  });

  /*
    豪州企画は 2026-08-17 08:00 JST 開始、訪問の計装は同日 22:28 JST。
    つまり**初日の約14時間ぶんの訪問が数えられていない**。
    「8/17 以降なら取れている」と思い込むと、この企画の初日を読み違える。
  */
  test("⭐豪州企画の訪問は partial(会期の途中で計装が始まっている)", () => {
    expect(
      resolveMetricAvailability(
        "visitsMember",
        AUSTRALIA_START,
        AUSTRALIA_END,
      ).status,
    ).toBe("partial");
  });

  test("計装後に始まった会期なら available", () => {
    expect(
      resolveMetricAvailability(
        "visitsMember",
        "2026-09-01T00:00:00.000Z",
        "2026-09-30T00:00:00.000Z",
      ).status,
    ).toBe("available");
  });

  /*
    神コレは 6/10 開始だが、preset_categories の表示期間は 6/13 20:00 JST から。
    シェアの計装は 6/13 21:35 JST なので、会期の途中で計装が始まっている。
  */
  test("⭐会期の途中から計装が始まったなら partial", () => {
    const result = resolveMetricAvailability("shares", WAFER_START, WAFER_END);

    expect(result.status).toBe("partial");
    expect(result.instrumentedSince).toBe(
      COLLECTION_METRIC_INSTRUMENTED_SINCE.shares,
    );
  });

  test("ファッション雑誌企画のシェアは available(計装より後の会期)", () => {
    expect(
      resolveMetricAvailability("shares", FASHION_START, FASHION_END).status,
    ).toBe("available");
  });

  test("境界: 会期の終わりが計装開始と同時なら unavailable(まだ1行も無い)", () => {
    const since = COLLECTION_METRIC_INSTRUMENTED_SINCE.visitsMember;

    expect(
      resolveMetricAvailability("visitsMember", FASHION_START, since).status,
    ).toBe("unavailable");
  });

  test("境界: 会期の始まりが計装開始と同時なら available", () => {
    const since = COLLECTION_METRIC_INSTRUMENTED_SINCE.visitsMember;

    expect(
      resolveMetricAvailability("visitsMember", since, AUSTRALIA_END).status,
    ).toBe("available");
  });

  /*
    日付が壊れているときに available と言い切ると、誤った確信を与える。
    注記付き(partial)に倒して「そのまま読むな」と伝える。
  */
  test("⭐日付が壊れていたら available ではなく partial に倒す", () => {
    expect(
      resolveMetricAvailability("shares", "not-a-date", FASHION_END).status,
    ).toBe("partial");
    expect(
      resolveMetricAvailability("shares", FASHION_START, "not-a-date").status,
    ).toBe("partial");
  });
});

describe("describeMetricAvailability", () => {
  test("available は注記を出さない", () => {
    expect(
      describeMetricAvailability({
        status: "available",
        instrumentedSince: "2026-08-17T13:28:10.050Z",
      }),
    ).toBeNull();
  });

  test("unavailable は理由と計装開始日を JST で伝える", () => {
    const text = describeMetricAvailability({
      status: "unavailable",
      instrumentedSince: "2026-08-17T13:28:10.050Z",
    });

    expect(text).toContain("計測対象外");
    // 13:28Z = 22:28 JST なので JST でも 08/17
    expect(text).toContain("2026/08/17");
  });

  test("partial は一部のみであることを伝える", () => {
    const text = describeMetricAvailability({
      status: "partial",
      instrumentedSince: "2026-06-13T12:35:17.140Z",
    });

    expect(text).toContain("一部のみ");
    expect(text).toContain("2026/06/13");
  });
});
