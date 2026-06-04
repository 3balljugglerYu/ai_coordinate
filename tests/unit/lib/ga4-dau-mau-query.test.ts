import {
  buildDauSeriesQuery,
  buildMauQuery,
} from "@/features/analytics/lib/ga4-dau-mau-query";

const PROJECT = "proj";
const DATASET = "ds";

describe("ga4-dau-mau-query", () => {
  test("buildDauSeriesQuery_DAU系列SQLがログイン状態で分割集計する", () => {
    const sql = buildDauSeriesQuery(PROJECT, DATASET, false);
    expect(sql).toContain("user_properties"); // logged_in user property を読む
    expect(sql).toContain("'logged_in'");
    expect(sql).toContain("COUNTIF"); // セグメント別カウント
    expect(sql).toContain("AS loggedIn");
    expect(sql).toContain("AS guest");
    expect(sql).toContain("AS unknown"); // 計測前/未取得
    expect(sql).toContain("'Asia/Tokyo'");
    expect(sql).toContain("GENERATE_DATE_ARRAY"); // 日次のゼロ埋め系列
    expect(sql).toContain("event_name = 'page_view'");
    expect(sql).toContain(`${PROJECT}.${DATASET}.events_*`);
    expect(sql).toContain("ORDER BY"); // dauRows は JST 昇順
  });

  test("buildDauSeriesQuery_intradayフラグでUNIONを切り替える", () => {
    const withIntraday = buildDauSeriesQuery(PROJECT, DATASET, true);
    const withoutIntraday = buildDauSeriesQuery(PROJECT, DATASET, false);

    expect(withIntraday).toContain("events_intraday_*");
    expect(withIntraday).toContain("UNION ALL");
    expect(withoutIntraday).not.toContain("events_intraday_*");
    expect(withoutIntraday).not.toContain("UNION ALL");
  });

  test("buildMauQuery_スカラー集計で日付系列を持たない", () => {
    const sql = buildMauQuery(PROJECT, DATASET, false);
    expect(sql).toContain("COUNT(DISTINCT user_pseudo_id)");
    expect(sql).toContain("AS mau");
    expect(sql).not.toContain("GENERATE_DATE_ARRAY"); // スカラーなので日次系列は無い
  });

  test("buildMauQuery_intradayフラグでUNIONを切り替える", () => {
    const withIntraday = buildMauQuery(PROJECT, DATASET, true);
    const withoutIntraday = buildMauQuery(PROJECT, DATASET, false);

    expect(withIntraday).toContain("events_intraday_*");
    expect(withIntraday).toContain("UNION ALL");
    expect(withoutIntraday).not.toContain("events_intraday_*");
    expect(withoutIntraday).not.toContain("UNION ALL");
  });
});
