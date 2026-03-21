import {
  buildOneTapStyleAnalytics,
  buildOneTapStyleSummary,
  type StyleUsageEventRow,
} from "@/features/admin-dashboard/lib/build-one-tap-style-summary";

describe("buildOneTapStyleSummary", () => {
  test("current と previous の visit/generate/download を集計する", () => {
    const events: StyleUsageEventRow[] = [
      {
        user_id: "user-1",
        auth_state: "authenticated",
        event_type: "visit",
        style_id: "paris_code",
        created_at: "2026-03-18T02:00:00.000Z",
      },
      {
        user_id: "user-1",
        auth_state: "authenticated",
        event_type: "generate",
        style_id: "paris_code",
        created_at: "2026-03-18T03:00:00.000Z",
      },
      {
        user_id: null,
        auth_state: "guest",
        event_type: "download",
        style_id: "paris_code",
        created_at: "2026-03-18T04:00:00.000Z",
      },
      {
        user_id: null,
        auth_state: "guest",
        event_type: "rate_limited",
        style_id: "paris_code",
        created_at: "2026-03-18T05:00:00.000Z",
      },
      {
        user_id: "user-3",
        auth_state: "authenticated",
        event_type: "visit",
        style_id: "fluffy_pajamas_code",
        created_at: "2026-03-17T02:00:00.000Z",
      },
      {
        user_id: null,
        auth_state: "guest",
        event_type: "download",
        style_id: "fluffy_pajamas_code",
        created_at: "2026-03-17T03:00:00.000Z",
      },
      {
        user_id: "user-4",
        auth_state: "authenticated",
        event_type: "rate_limited",
        style_id: "fluffy_pajamas_code",
        created_at: "2026-03-17T04:00:00.000Z",
      },
    ];

    const summary = buildOneTapStyleSummary({
      events,
      previousStart: new Date("2026-03-17T00:00:00.000Z"),
      currentStart: new Date("2026-03-18T00:00:00.000Z"),
      now: new Date("2026-03-18T23:59:59.000Z"),
    });

    expect(summary.metrics).toEqual([
      {
        key: "visits",
        label: "訪問数",
        currentCount: 1,
        previousCount: 1,
        deltaPct: 0,
        deltaDirection: "flat",
      },
      {
        key: "generations",
        label: "生成数",
        currentCount: 1,
        previousCount: 0,
        deltaPct: null,
        deltaDirection: "up",
      },
      {
        key: "downloads",
        label: "ダウンロード数",
        currentCount: 1,
        previousCount: 1,
        deltaPct: 0,
        deltaDirection: "flat",
      },
      {
        key: "rateLimited",
        label: "上限到達数",
        currentCount: 1,
        previousCount: 1,
        deltaPct: 0,
        deltaDirection: "flat",
      },
    ]);
  });

  test("current 期間の日別 trend を生成する", () => {
    const events: StyleUsageEventRow[] = [
      {
        user_id: "user-1",
        auth_state: "authenticated",
        event_type: "visit",
        style_id: null,
        created_at: "2026-03-18T02:00:00.000Z",
      },
      {
        user_id: null,
        auth_state: "guest",
        event_type: "generate",
        style_id: "paris_code",
        created_at: "2026-03-18T03:00:00.000Z",
      },
      {
        user_id: "user-2",
        auth_state: "authenticated",
        event_type: "download",
        style_id: "paris_code",
        created_at: "2026-03-19T04:00:00.000Z",
      },
      {
        user_id: null,
        auth_state: "guest",
        event_type: "rate_limited",
        style_id: "paris_code",
        created_at: "2026-03-19T05:00:00.000Z",
      },
    ];

    const analytics = buildOneTapStyleAnalytics({
      events,
      previousStart: new Date("2026-03-17T00:00:00.000Z"),
      currentStart: new Date("2026-03-18T00:00:00.000Z"),
      now: new Date("2026-03-19T23:59:59.000Z"),
    });

    expect(analytics.trend).toEqual([
      {
        bucket: "2026-03-18",
        label: "3/18",
        visits: 1,
        generations: 1,
        downloads: 0,
        rateLimited: 0,
      },
      {
        bucket: "2026-03-19",
        label: "3/19",
        visits: 0,
        generations: 0,
        downloads: 1,
        rateLimited: 1,
      },
      {
        bucket: "2026-03-20",
        label: "3/20",
        visits: 0,
        generations: 0,
        downloads: 0,
        rateLimited: 0,
      },
    ]);
  });
});
