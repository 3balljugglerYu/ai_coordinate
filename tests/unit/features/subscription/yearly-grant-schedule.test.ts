import { createYearlyPercoinGrantState } from "@/features/subscription/lib/yearly-grant-schedule";

describe("createYearlyPercoinGrantState", () => {
  test("年額開始時点を付与済みとして次回月次付与日を 1 か月後に設定する", () => {
    const state = createYearlyPercoinGrantState({
      currentPeriodStart: "2026-03-31T00:00:00.000Z",
      currentPeriodEnd: "2027-03-31T00:00:00.000Z",
    });

    expect(state).toEqual({
      lastPercoinGrantAt: "2026-03-31T00:00:00.000Z",
      nextPercoinGrantAt: "2026-04-30T00:00:00.000Z",
    });
  });

  test("次回付与日が請求期間の外に出る場合は null にする", () => {
    const state = createYearlyPercoinGrantState({
      currentPeriodStart: "2026-03-31T00:00:00.000Z",
      currentPeriodEnd: "2026-04-15T00:00:00.000Z",
    });

    expect(state).toEqual({
      lastPercoinGrantAt: "2026-03-31T00:00:00.000Z",
      nextPercoinGrantAt: null,
    });
  });
});
