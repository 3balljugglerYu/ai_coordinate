import {
  buildOneTapStyleAnalytics,
  buildOneTapStyleSummary,
  type StyleUsageEventRow,
} from "@/features/admin-dashboard/lib/build-one-tap-style-summary";
import {
  buildOneTapStyleDetailedAnalytics,
  type StyleGeneratedImageRow,
  type StyleGuestGenerateAttemptRow,
  type StylePresetDashboardRow,
  type StyleSignupProfileRow,
} from "@/features/admin-dashboard/lib/build-one-tap-style-detailed";

describe("buildOneTapStyleSummary", () => {
  test("current と previous の visit/generate/signup を集計する", () => {
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
        event_type: "signup_click",
        style_id: "paris_code",
        created_at: "2026-03-18T04:00:00.000Z",
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
        event_type: "signup_click",
        style_id: "fluffy_pajamas_code",
        created_at: "2026-03-17T03:00:00.000Z",
      },
    ];
    const profiles: StyleSignupProfileRow[] = [
      {
        user_id: "user-9",
        created_at: "2026-03-18T06:00:00.000Z",
        signup_source: "style",
      },
      {
        user_id: "user-10",
        created_at: "2026-03-17T06:00:00.000Z",
        signup_source: "style",
      },
    ];

    const summary = buildOneTapStyleSummary({
      events,
      profiles,
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
        label: "生成成功数",
        currentCount: 1,
        previousCount: 0,
        deltaPct: null,
        deltaDirection: "up",
      },
      {
        key: "signupClicks",
        label: "新規登録CTAクリック数",
        currentCount: 1,
        previousCount: 1,
        deltaPct: 0,
        deltaDirection: "flat",
      },
      {
        key: "signupCompletions",
        label: "新規登録完了数",
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
        event_type: "signup_click",
        style_id: "paris_code",
        created_at: "2026-03-19T04:00:00.000Z",
      },
    ];
    const profiles: StyleSignupProfileRow[] = [
      {
        user_id: "user-3",
        created_at: "2026-03-19T06:00:00.000Z",
        signup_source: "style",
      },
    ];

    const analytics = buildOneTapStyleAnalytics({
      events,
      profiles,
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
        signupClicks: 0,
        signupCompletions: 0,
      },
      {
        bucket: "2026-03-19",
        label: "3/19",
        visits: 0,
        generations: 0,
        signupClicks: 1,
        signupCompletions: 1,
      },
      {
        bucket: "2026-03-20",
        label: "3/20",
        visits: 0,
        generations: 0,
        signupClicks: 0,
        signupCompletions: 0,
      },
    ]);
  });

  test("detail 用の auth_state / style_id / guest試行数 をまとめて分析できる", () => {
    const events: StyleUsageEventRow[] = [
      {
        user_id: "user-1",
        auth_state: "authenticated",
        event_type: "generate_attempt",
        style_id: "paris_code",
        created_at: "2026-03-18T01:00:00.000Z",
      },
      {
        user_id: "user-1",
        auth_state: "authenticated",
        event_type: "generate",
        style_id: "paris_code",
        created_at: "2026-03-18T02:00:00.000Z",
      },
      {
        user_id: null,
        auth_state: "guest",
        event_type: "generate_attempt",
        style_id: "paris_code",
        created_at: "2026-03-18T02:30:00.000Z",
      },
      {
        user_id: null,
        auth_state: "guest",
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
    ];
    const guestAttempts: StyleGuestGenerateAttemptRow[] = [
      { created_at: "2026-03-18T03:00:00.000Z" },
      { created_at: "2026-03-17T03:00:00.000Z" },
    ];
    const generatedImages: StyleGeneratedImageRow[] = [
      {
        created_at: "2026-03-18T02:00:00.000Z",
        is_posted: true,
        generation_type: "one_tap_style",
        generation_metadata: {
          oneTapStyle: {
            id: "paris_code",
            title: "PARIS CODE",
            thumbnailImageUrl: "https://example.com/paris.webp",
            thumbnailWidth: 912,
            thumbnailHeight: 1173,
            hasBackgroundPrompt: true,
            billingMode: "paid",
          },
        },
      },
      {
        created_at: "2026-03-18T06:00:00.000Z",
        is_posted: false,
        generation_type: "one_tap_style",
        generation_metadata: {
          oneTapStyle: {
            id: "paris_code",
            title: "PARIS CODE",
            thumbnailImageUrl: "https://example.com/paris.webp",
            thumbnailWidth: 912,
            thumbnailHeight: 1173,
            hasBackgroundPrompt: true,
            billingMode: "free",
          },
        },
      },
    ];
    const presets: StylePresetDashboardRow[] = [
      {
        id: "paris_code",
        title: "PARIS CODE",
        status: "published",
        sort_order: 1,
      },
      {
        id: "unused_code",
        title: "UNUSED CODE",
        status: "published",
        sort_order: 2,
      },
    ];
    const profiles: StyleSignupProfileRow[] = [
      {
        user_id: "user-1",
        created_at: "2026-03-18T00:30:00.000Z",
        signup_source: "style",
      },
    ];

    const detailed = buildOneTapStyleDetailedAnalytics({
      events,
      guestAttempts,
      generatedImages,
      presets,
      profiles,
      previousStart: new Date("2026-03-17T00:00:00.000Z"),
      currentStart: new Date("2026-03-18T00:00:00.000Z"),
      now: new Date("2026-03-18T23:59:59.000Z"),
    });

    expect(detailed.focusMetrics[0]).toMatchObject({
      key: "attempts",
      value: "2回",
      previousValue: "1回",
    });
    expect(detailed.segments).toEqual([
      expect.objectContaining({
        authState: "authenticated",
        attempts: 1,
        generations: 1,
        paidGenerations: 1,
        paidGenerationRatePct: 100,
        successRatePct: 100,
      }),
      expect.objectContaining({
        authState: "guest",
        attempts: 1,
        generations: 1,
        downloads: 1,
        rateLimited: 1,
        paidGenerations: 0,
        paidGenerationRatePct: null,
        successRatePct: 100,
        rateLimitedSharePct: 50,
      }),
    ]);
    expect(detailed.focusMetrics[3]).toMatchObject({
      key: "paidContinuations",
      value: "1件",
      previousValue: "0件",
    });
    expect(detailed.presetPerformance[0]).toMatchObject({
      presetId: "paris_code",
      title: "PARIS CODE",
      generations: 2,
      downloads: 1,
      postedCount: 1,
      paidGenerations: 1,
      authenticatedAttempts: 1,
      guestAttempts: 1,
      authenticatedSuccessRatePct: 100,
      guestSuccessRatePct: 100,
      downloadRatePct: 50,
      postRatePct: 50,
      paidGenerationRatePct: 100,
    });
    expect(detailed.operationalSummary.paidGenerationCount).toBe(1);
    expect(detailed.signupFunnel).toEqual({
      steps: [
        {
          label: "CTAクリック数",
          count: 0,
          rateFromPrevious: null,
        },
        {
          label: "登録完了数",
          count: 1,
          rateFromPrevious: null,
        },
        {
          label: "style復帰数",
          count: 1,
          rateFromPrevious: 100,
        },
        {
          label: "初回生成数",
          count: 1,
          rateFromPrevious: 100,
        },
      ],
      clickToSignupRatePct: null,
      signupReturnRatePct: 100,
      signupGenerationRatePct: 100,
    });
    expect(detailed.dormantPublishedPresetTitles).toEqual(["UNUSED CODE"]);
    expect(detailed.insights.length).toBeGreaterThan(0);
  });
});
