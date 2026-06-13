import {
  buildCollectionKpi,
  extractOneTapStyleId,
  type CollectionCompletionRow,
  type CollectionEventRow,
  type CollectionImageJobRow,
} from "@/features/admin-dashboard/lib/build-collection-kpi";

// 固定ウィンドウ(7d 相当): current=[06-06,06-13], previous=[05-30,06-06]
const NOW = new Date("2026-06-13T00:00:00.000Z");
const CURRENT_START = new Date("2026-06-06T00:00:00.000Z");
const PREVIOUS_START = new Date("2026-05-30T00:00:00.000Z");

function build(params: {
  presetIds?: string[];
  completionRows?: CollectionCompletionRow[];
  imageJobRows?: CollectionImageJobRow[];
  eventRows?: CollectionEventRow[];
}) {
  return buildCollectionKpi({
    categoryKey: "wafer",
    presetIds: params.presetIds ?? [],
    completionRows: params.completionRows ?? [],
    imageJobRows: params.imageJobRows ?? [],
    eventRows: params.eventRows ?? [],
    currentStart: CURRENT_START,
    previousStart: PREVIOUS_START,
    now: NOW,
  });
}

describe("buildCollectionKpi", () => {
  test("completed を current / previous / 範囲外に振り分ける", () => {
    const kpi = build({
      completionRows: [
        { mount_status: "completed", completed_at: "2026-06-10T00:00:00.000Z" }, // current
        { mount_status: "completed", completed_at: "2026-06-02T00:00:00.000Z" }, // previous
        { mount_status: "completed", completed_at: "2026-05-01T00:00:00.000Z" }, // 範囲外
      ],
    });

    expect(kpi.completions.current).toBe(1);
    expect(kpi.completions.previous).toBe(1);
    expect(kpi.completions.deltaPct).toBe(0);
    expect(kpi.completions.deltaDirection).toBe("flat");
  });

  test("failed は mountsFailed に集計し completions に混ざらない", () => {
    const kpi = build({
      completionRows: [
        { mount_status: "failed", completed_at: "2026-06-10T00:00:00.000Z" },
        { mount_status: "completed", completed_at: "2026-06-10T00:00:00.000Z" },
      ],
    });

    expect(kpi.completions.current).toBe(1);
    expect(kpi.mountsFailed.current).toBe(1);
  });

  test("completed_at が null の行は無視する", () => {
    const kpi = build({
      completionRows: [{ mount_status: "completed", completed_at: null }],
    });

    expect(kpi.completions.current).toBe(0);
    expect(kpi.completions.previous).toBe(0);
  });

  test("JST 日境界でトレンドのバケットを決める", () => {
    const kpi = build({
      completionRows: [
        // 2026-06-12 15:30Z = 2026-06-13 00:30 JST → 06-13 バケット
        { mount_status: "completed", completed_at: "2026-06-12T15:30:00.000Z" },
      ],
    });

    const jun13 = kpi.trend.find((p) => p.bucket === "2026-06-13");
    const jun12 = kpi.trend.find((p) => p.bucket === "2026-06-12");
    expect(jun13?.completions).toBe(1);
    expect(jun12?.completions).toBe(0);
  });

  test("トレンドは currentStart..now を JST 日別でゼロ埋めし昇順に並ぶ", () => {
    const kpi = build({});

    expect(kpi.trend).toHaveLength(8);
    expect(kpi.trend[0].bucket).toBe("2026-06-06");
    expect(kpi.trend[7].bucket).toBe("2026-06-13");
    expect(kpi.trend.every((p) => p.completions === 0)).toBe(true);
  });

  test("空データは全メトリクス0・outfitCounts空・トレンドゼロ埋め", () => {
    const kpi = build({});

    const metrics = [
      kpi.completions,
      kpi.mountsFailed,
      kpi.seriesGenerations,
      kpi.visitsMember,
      kpi.visitsGuest,
      kpi.generates,
      kpi.downloads,
      kpi.saveClicks,
      kpi.signupClicks,
    ];
    for (const metric of metrics) {
      expect(metric.current).toBe(0);
      expect(metric.previous).toBe(0);
      expect(metric.deltaPct).toBe(0);
      expect(metric.deltaDirection).toBe("flat");
    }
    expect(kpi.outfitCounts).toEqual([]);
    expect(kpi.trend).toHaveLength(8);
  });

  test("previous=0 & current>0 は New(deltaPct=null, up)", () => {
    const kpi = build({
      completionRows: [
        { mount_status: "completed", completed_at: "2026-06-10T00:00:00.000Z" },
        { mount_status: "completed", completed_at: "2026-06-11T00:00:00.000Z" },
      ],
    });

    expect(kpi.completions.current).toBe(2);
    expect(kpi.completions.previous).toBe(0);
    expect(kpi.completions.deltaPct).toBeNull();
    expect(kpi.completions.deltaDirection).toBe("up");
  });

  test("image_jobs から seriesGenerations と衣装別を集計(N+1 統合)", () => {
    const kpi = build({
      presetIds: ["preset-a", "preset-b"],
      imageJobRows: [
        {
          created_at: "2026-06-10T00:00:00.000Z",
          generation_metadata: { oneTapStyle: { id: "preset-a" } },
        },
        {
          created_at: "2026-06-10T01:00:00.000Z",
          generation_metadata: { oneTapStyle: { id: "preset-a" } },
        },
        {
          created_at: "2026-06-11T00:00:00.000Z",
          generation_metadata: { oneTapStyle: { id: "preset-b" } },
        },
        {
          created_at: "2026-06-11T00:00:00.000Z",
          generation_metadata: { oneTapStyle: { id: "unknown-preset" } },
        },
        { created_at: "2026-06-11T00:00:00.000Z", generation_metadata: null },
        {
          created_at: "2026-06-02T00:00:00.000Z", // previous
          generation_metadata: { oneTapStyle: { id: "preset-a" } },
        },
      ],
    });

    expect(kpi.seriesGenerations.current).toBe(5);
    expect(kpi.seriesGenerations.previous).toBe(1);
    // presetIds の順序を保ち、preset に無い id や metadata 欠落は除外
    expect(kpi.outfitCounts).toEqual([
      { presetId: "preset-a", count: 2 },
      { presetId: "preset-b", count: 1 },
    ]);
  });

  test("style_usage_events のファネルを集計(visit は auth で分割)", () => {
    const kpi = build({
      presetIds: ["preset-a"],
      eventRows: [
        { auth_state: "authenticated", event_type: "visit", created_at: "2026-06-10T00:00:00.000Z" },
        { auth_state: "guest", event_type: "visit", created_at: "2026-06-10T00:00:00.000Z" },
        { auth_state: "guest", event_type: "visit", created_at: "2026-06-10T01:00:00.000Z" },
        { auth_state: "authenticated", event_type: "generate", created_at: "2026-06-10T00:00:00.000Z" },
        { auth_state: "guest", event_type: "download", created_at: "2026-06-10T00:00:00.000Z" },
        { auth_state: "authenticated", event_type: "wardrobe_save_click", created_at: "2026-06-10T00:00:00.000Z" },
        { auth_state: "guest", event_type: "signup_click", created_at: "2026-06-10T00:00:00.000Z" },
      ],
    });

    expect(kpi.visitsMember.current).toBe(1);
    expect(kpi.visitsGuest.current).toBe(2);
    expect(kpi.generates.current).toBe(1);
    expect(kpi.downloads.current).toBe(1);
    expect(kpi.saveClicks.current).toBe(1);
    expect(kpi.signupClicks.current).toBe(1);

    // 当日(06-10)のトレンドにファネルが入る
    const jun10 = kpi.trend.find((p) => p.bucket === "2026-06-10");
    expect(jun10?.generates).toBe(1);
    expect(jun10?.downloads).toBe(1);
    expect(jun10?.signupClicks).toBe(1);
  });
});

describe("extractOneTapStyleId", () => {
  test("null metadata → null", () => {
    expect(extractOneTapStyleId(null)).toBeNull();
  });

  test("oneTapStyle 欠落 → null", () => {
    expect(extractOneTapStyleId({ foo: 1 })).toBeNull();
  });

  test("id が string でない → null", () => {
    expect(extractOneTapStyleId({ oneTapStyle: { id: 123 } })).toBeNull();
  });

  test("正常 → id を返す", () => {
    expect(extractOneTapStyleId({ oneTapStyle: { id: "abc" } })).toBe("abc");
  });
});
