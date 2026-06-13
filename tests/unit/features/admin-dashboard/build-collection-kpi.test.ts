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
  shareRows?: CollectionEventRow[];
}) {
  return buildCollectionKpi({
    categoryKey: "wafer",
    presets: (params.presetIds ?? []).map((id) => ({ id, label: id })),
    completionRows: params.completionRows ?? [],
    imageJobRows: params.imageJobRows ?? [],
    eventRows: params.eventRows ?? [],
    shareRows: params.shareRows ?? [],
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
      kpi.shares,
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
      { presetId: "preset-a", label: "preset-a", count: 2 },
      { presetId: "preset-b", label: "preset-b", count: 1 },
    ]);

    // B-3: 日別 × 柱別(counts は柱順 [preset-a, preset-b])
    const outfitJun10 = kpi.outfitDaily.find((p) => p.bucket === "2026-06-10");
    const outfitJun11 = kpi.outfitDaily.find((p) => p.bucket === "2026-06-11");
    expect(outfitJun10?.counts).toEqual([2, 0]);
    expect(outfitJun11?.counts).toEqual([0, 1]);
    expect(kpi.outfitDaily).toHaveLength(8);
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

    // 生成/DL の member/guest 内訳(A-2 お試し / A-6 DL分離)
    expect(kpi.generates.member).toBe(1);
    expect(kpi.generates.guest).toBe(0);
    expect(kpi.downloads.member).toBe(0);
    expect(kpi.downloads.guest).toBe(1);

    // 当日(06-10)のトレンドにファネルが入る(日別の訪問・分割も)
    const jun10 = kpi.trend.find((p) => p.bucket === "2026-06-10");
    expect(jun10?.visitsMember).toBe(1);
    expect(jun10?.visitsGuest).toBe(2);
    expect(jun10?.generates).toBe(1);
    expect(jun10?.downloads).toBe(1);
    expect(jun10?.downloadsGuest).toBe(1);
    expect(jun10?.signupClicks).toBe(1);
  });

  test("お試し生成(ゲスト)を generatesGuest として日別にも集計する", () => {
    const kpi = build({
      presetIds: ["preset-a"],
      eventRows: [
        { auth_state: "guest", event_type: "generate", created_at: "2026-06-10T00:00:00.000Z" },
        { auth_state: "guest", event_type: "generate", created_at: "2026-06-10T02:00:00.000Z" },
        { auth_state: "authenticated", event_type: "generate", created_at: "2026-06-10T03:00:00.000Z" },
      ],
    });

    expect(kpi.generates.current).toBe(3);
    expect(kpi.generates.guest).toBe(2);
    expect(kpi.generates.member).toBe(1);
    const jun10 = kpi.trend.find((p) => p.bucket === "2026-06-10");
    expect(jun10?.generatesGuest).toBe(2);
    expect(jun10?.generates).toBe(3);
  });

  test("mount_shared(シェア)を shareRows から集計する", () => {
    const kpi = build({
      shareRows: [
        { auth_state: "authenticated", event_type: "mount_shared", created_at: "2026-06-10T00:00:00.000Z" },
        { auth_state: "authenticated", event_type: "mount_shared", created_at: "2026-06-02T00:00:00.000Z" }, // previous
        { auth_state: "authenticated", event_type: "visit", created_at: "2026-06-10T00:00:00.000Z" }, // mount_shared 以外は無視
      ],
    });

    expect(kpi.shares.current).toBe(1);
    expect(kpi.shares.previous).toBe(1);
    const jun10 = kpi.trend.find((p) => p.bucket === "2026-06-10");
    expect(jun10?.shares).toBe(1);
  });

  test("previous 期間の各イベントを previous に計上し、未知イベントは無視する", () => {
    const prevAt = "2026-06-02T00:00:00.000Z"; // previous window
    const kpi = build({
      presetIds: ["preset-a"],
      completionRows: [{ mount_status: "failed", completed_at: prevAt }],
      eventRows: [
        { auth_state: "authenticated", event_type: "visit", created_at: prevAt },
        { auth_state: "guest", event_type: "visit", created_at: prevAt },
        { auth_state: "authenticated", event_type: "generate", created_at: prevAt },
        { auth_state: "authenticated", event_type: "download", created_at: prevAt },
        { auth_state: "authenticated", event_type: "wardrobe_save_click", created_at: prevAt },
        { auth_state: "guest", event_type: "signup_click", created_at: prevAt },
        { auth_state: "authenticated", event_type: "rate_limited", created_at: prevAt }, // 未知→無視
      ],
      shareRows: [
        { auth_state: "authenticated", event_type: "mount_shared", created_at: prevAt },
      ],
    });

    expect(kpi.mountsFailed.previous).toBe(1);
    expect(kpi.visitsMember.previous).toBe(1);
    expect(kpi.visitsGuest.previous).toBe(1);
    expect(kpi.generates.previous).toBe(1);
    expect(kpi.downloads.previous).toBe(1);
    expect(kpi.saveClicks.previous).toBe(1);
    expect(kpi.signupClicks.previous).toBe(1);
    expect(kpi.shares.previous).toBe(1);
    // current は全て0(previous のみ)
    expect(kpi.visitsMember.current).toBe(0);
    expect(kpi.generates.current).toBe(0);
  });

  test("ダウンロードの member 内訳と日別 downloadsMember を集計する", () => {
    const kpi = build({
      presetIds: ["preset-a"],
      eventRows: [
        { auth_state: "authenticated", event_type: "download", created_at: "2026-06-10T00:00:00.000Z" },
      ],
    });

    expect(kpi.downloads.member).toBe(1);
    expect(kpi.downloads.guest).toBe(0);
    const jun10 = kpi.trend.find((p) => p.bucket === "2026-06-10");
    expect(jun10?.downloadsMember).toBe(1);
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
