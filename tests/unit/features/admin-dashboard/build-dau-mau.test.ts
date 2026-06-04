import {
  buildDauMau,
  type DauMauActivityRow,
} from "@/features/admin-dashboard/lib/build-dau-mau";

// now を固定して決定論的に検証(JST 2026-03-30 14:00 = UTC 05:00)。
// 直近30日(当日含む)の窓 = JST 2026-03-01 .. 2026-03-30。
const NOW = new Date("2026-03-30T05:00:00.000Z");

function row(userId: string | null, isoCreatedAt: string): DauMauActivityRow {
  return { user_id: userId, created_at: isoCreatedAt };
}

describe("buildDauMau", () => {
  test("buildDauMau_複数ユーザー複数日_distinct集計とstickinessを返す", () => {
    const activity: DauMauActivityRow[] = [
      row("user-a", "2026-03-30T05:00:00.000Z"), // 当日 (A)
      row("user-a", "2026-03-30T06:00:00.000Z"), // 当日 同ユーザー重複 → 1
      row("user-b", "2026-03-30T05:30:00.000Z"), // 当日 (B)
      row("user-a", "2026-03-20T05:00:00.000Z"), // 10日前 (A) MAUでは重複しない
      row("user-c", "2026-03-10T05:00:00.000Z"), // 20日前 (C)
    ];

    const result = buildDauMau({ activity, now: NOW });

    expect(result.dau).toBe(2); // 当日 distinct = {A, B}
    expect(result.mau).toBe(3); // 30日 distinct = {A, B, C}
    expect(result.stickinessPct).toBe(66.7); // 2/3*100 を小数1桁

    expect(result.trend).toHaveLength(30);
    expect(result.trend.find((p) => p.bucket === "2026-03-30")?.count).toBe(2);
    expect(result.trend.find((p) => p.bucket === "2026-03-20")?.count).toBe(1);
    expect(result.trend.find((p) => p.bucket === "2026-03-10")?.count).toBe(1);
    expect(result.trend.find((p) => p.bucket === "2026-03-30")?.label).toBe(
      "3/30"
    );
    // trend は JST 昇順・末尾が当日(順序が崩れた実装を弾く)
    expect(result.trend[29]?.bucket).toBe("2026-03-30");
  });

  test("buildDauMau_JST日境界_UTC15時は翌JST日として集計する", () => {
    const activity: DauMauActivityRow[] = [
      row("user-g", "2026-03-29T15:00:00.000Z"), // +9h = JST 03-30 00:00 → 当日
      row("user-h", "2026-03-29T14:59:59.000Z"), // +9h = JST 03-29 23:59 → 前日
    ];

    const result = buildDauMau({ activity, now: NOW });

    expect(result.dau).toBe(1); // 当日(JST 03-30)は user-g のみ
    expect(result.mau).toBe(2); // 両者とも30日窓内
    expect(result.trend.find((p) => p.bucket === "2026-03-30")?.count).toBe(1);
    expect(result.trend.find((p) => p.bucket === "2026-03-29")?.count).toBe(1);
  });

  test("buildDauMau_30日境界_29日前は含み30日前は除外する", () => {
    const activity: DauMauActivityRow[] = [
      row("user-d", "2026-03-01T05:00:00.000Z"), // 29日前(窓の起点・内)
      row("user-e", "2026-02-28T05:00:00.000Z"), // 30日前(窓外)
    ];

    const result = buildDauMau({ activity, now: NOW });

    expect(result.mau).toBe(1); // user-d のみ。user-e は窓外で除外
    expect(result.dau).toBe(0); // 当日は無し
    expect(result.stickinessPct).toBe(0); // 0/1
    expect(result.trend).toHaveLength(30);
    expect(result.trend[0]?.bucket).toBe("2026-03-01"); // 窓の起点
    expect(result.trend.find((p) => p.bucket === "2026-03-01")?.count).toBe(1);
    expect(result.trend.some((p) => p.bucket === "2026-02-28")).toBe(false); // 窓外日は存在しない
  });

  test("buildDauMau_空入力_全て0でstickinessはnull", () => {
    const result = buildDauMau({ activity: [], now: NOW });

    expect(result.dau).toBe(0);
    expect(result.mau).toBe(0);
    expect(result.stickinessPct).toBeNull();
    expect(result.trend).toHaveLength(30);
    expect(result.trend.every((p) => p.count === 0)).toBe(true);
  });

  test("buildDauMau_nullユーザーidの行_アクティブに数えない", () => {
    const activity: DauMauActivityRow[] = [
      row("user-f", "2026-03-30T05:00:00.000Z"), // 当日 ログイン
      row(null, "2026-03-30T05:00:00.000Z"), // 当日 ゲスト(除外)
      row(null, "2026-03-15T05:00:00.000Z"), // 15日前 ゲスト(除外)
    ];

    const result = buildDauMau({ activity, now: NOW });

    expect(result.dau).toBe(1); // user-f のみ
    expect(result.mau).toBe(1);
    expect(result.stickinessPct).toBe(100);
    expect(result.trend.find((p) => p.bucket === "2026-03-30")?.count).toBe(1);
    expect(result.trend.find((p) => p.bucket === "2026-03-15")?.count).toBe(0);
  });
});
