import {
  buildBillingTableLookupQuery,
  buildGeminiBillingCostQuery,
  GEMINI_SERVICE_DESCRIPTIONS,
  parseBillingCost,
} from "@/features/admin-dashboard/lib/billing-bigquery-query";

describe("buildGeminiBillingCostQuery", () => {
  const query = buildGeminiBillingCostQuery(
    "my-project",
    "billing_export",
    "gcp_billing_export_v1_ABC123"
  );

  it("完全修飾のテーブル参照を組み立てる", () => {
    expect(query).toContain(
      "`my-project.billing_export.gcp_billing_export_v1_ABC123`"
    );
  });

  it("期間とサービス名を名前付きパラメータで受け取る", () => {
    expect(query).toContain("@startTimestamp");
    expect(query).toContain("@endTimestamp");
    expect(query).toContain("@serviceDescriptions");
  });

  it("credits を差し引いた実支払額を集計する", () => {
    expect(query).toContain("SUM(cost +");
    expect(query).toContain("UNNEST(credits)");
  });

  it("通貨ごとに集計する", () => {
    expect(query).toContain("GROUP BY currency");
  });
});

describe("buildBillingTableLookupQuery", () => {
  it("課金エクスポートのテーブル名を検索する", () => {
    const query = buildBillingTableLookupQuery("my-project", "billing_export");

    expect(query).toContain("INFORMATION_SCHEMA.TABLES");
    expect(query).toContain("gcp_billing_export_v1_%");
  });
});

describe("GEMINI_SERVICE_DESCRIPTIONS", () => {
  it("Generative Language API を含む", () => {
    expect(GEMINI_SERVICE_DESCRIPTIONS).toContain("Generative Language API");
  });
});

describe("parseBillingCost", () => {
  it("数値をそのまま返す", () => {
    expect(parseBillingCost(12.34)).toBeCloseTo(12.34, 4);
  });

  it("BigQuery の数値ラッパー(valueプロパティ)を展開する", () => {
    expect(parseBillingCost({ value: "5.5" })).toBeCloseTo(5.5, 4);
  });

  it("数値文字列をパースする", () => {
    expect(parseBillingCost("3.25")).toBeCloseTo(3.25, 4);
  });

  it("null・undefined・非数値は0にする", () => {
    expect(parseBillingCost(null)).toBe(0);
    expect(parseBillingCost(undefined)).toBe(0);
    expect(parseBillingCost("abc")).toBe(0);
    expect(parseBillingCost(Number.NaN)).toBe(0);
  });
});
