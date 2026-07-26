import { buildLoginMethodMix } from "@/features/admin-dashboard/lib/get-admin-dashboard-data";

// 固定ウィンドウ(7d 相当): current=[07-19, 07-26]
const NOW = new Date("2026-07-26T00:00:00.000Z");
const CURRENT_START = new Date("2026-07-19T00:00:00.000Z");

const IN_RANGE = "2026-07-20T10:00:00.000Z";
const BEFORE_RANGE = "2026-06-01T10:00:00.000Z";

describe("buildLoginMethodMix", () => {
  it("空入力なら空配列を返す", () => {
    expect(buildLoginMethodMix([], CURRENT_START, NOW)).toEqual([]);
  });

  it("期間内と累計を別々に集計し、累計降順で並べる", () => {
    const rows = [
      { created_at: BEFORE_RANGE, provider: "google" },
      { created_at: BEFORE_RANGE, provider: "google" },
      { created_at: BEFORE_RANGE, provider: "email" },
      { created_at: IN_RANGE, provider: "x" },
      { created_at: IN_RANGE, provider: "google" },
    ];

    const result = buildLoginMethodMix(rows, CURRENT_START, NOW);

    expect(result.map((item) => item.provider)).toEqual([
      "google",
      "email",
      "x",
    ]);

    const google = result[0];
    expect(google.label).toBe("Google");
    expect(google.count).toBe(1);
    expect(google.sharePct).toBe(50);
    expect(google.cumulativeCount).toBe(3);
    expect(google.cumulativeSharePct).toBe(60);

    const email = result[1];
    expect(email.count).toBe(0);
    expect(email.sharePct).toBe(0);
    expect(email.cumulativeCount).toBe(1);

    const x = result[2];
    expect(x.label).toBe("X");
    expect(x.count).toBe(1);
    expect(x.sharePct).toBe(50);
  });

  it("twitter は x に正規化し、未知プロバイダと null は畳む", () => {
    const rows = [
      { created_at: IN_RANGE, provider: "twitter" },
      { created_at: IN_RANGE, provider: "x" },
      { created_at: IN_RANGE, provider: "github" },
      { created_at: IN_RANGE, provider: null },
    ];

    const result = buildLoginMethodMix(rows, CURRENT_START, NOW);

    const x = result.find((item) => item.provider === "x");
    expect(x?.count).toBe(2);
    expect(x?.label).toBe("X");

    const other = result.find((item) => item.provider === "other");
    expect(other?.count).toBe(2);
    expect(other?.label).toBe("その他");

    expect(result).toHaveLength(2);
  });

  it("期間内ゼロでも累計側のシェアは計算される", () => {
    const rows = [
      { created_at: BEFORE_RANGE, provider: "google" },
      { created_at: BEFORE_RANGE, provider: "email" },
    ];

    const result = buildLoginMethodMix(rows, CURRENT_START, NOW);

    expect(result.every((item) => item.count === 0)).toBe(true);
    expect(result.every((item) => item.sharePct === 0)).toBe(true);
    expect(
      result.reduce((sum, item) => sum + item.cumulativeSharePct, 0)
    ).toBeCloseTo(100);
  });

  it("シェアは小数1桁に丸める", () => {
    const rows = [
      { created_at: IN_RANGE, provider: "google" },
      { created_at: IN_RANGE, provider: "google" },
      { created_at: IN_RANGE, provider: "email" },
    ];

    const result = buildLoginMethodMix(rows, CURRENT_START, NOW);

    const google = result.find((item) => item.provider === "google");
    expect(google?.sharePct).toBe(66.7);
  });
});
