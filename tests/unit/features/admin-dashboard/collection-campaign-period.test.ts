/**
 * 会期(preset_categories の表示期間)を集計期間に解決する。
 *
 * 既定が「直近30日」だったため、会期を見るには毎回 datetime-local に手入力していた。
 * 会期は DB にあるのだから既定にできる。手入力は打ち間違いがそのまま誤った資料になる。
 *
 * 実データでの裏取り: ファッション雑誌企画の表示期間は
 * 2026-08-08 10:00Z 〜 2026-08-16 13:00Z で、手集計に使った期間と完全に一致した。
 * この解決を通した集計は 生成245 / 生成UU29 / 完走19 / シェアUU16 を再現している。
 */

import { resolveCampaignPeriod } from "@/features/admin-dashboard/lib/collection-campaign-period";

const FASHION_START = "2026-08-08T10:00:00.000Z";
const FASHION_END = "2026-08-16T13:00:00.000Z";
const AFTER_FASHION = new Date("2026-08-19T00:00:00.000Z");

describe("resolveCampaignPeriod", () => {
  test("終了済みの企画は会期をそのまま返す", () => {
    expect(
      resolveCampaignPeriod({
        startsAt: FASHION_START,
        endsAt: FASHION_END,
        now: AFTER_FASHION,
      }),
    ).toEqual({
      fromIso: FASHION_START,
      toIso: FASHION_END,
      isOngoing: false,
    });
  });

  /*
    開催中の企画で終端を未来のままにすると、前期間比の「前期間」が会期の全長ぶん
    遡ってしまい、現在期間だけ短く前期間だけ長い形になって比較にならない。
  */
  test("⭐開催中は終端を「今」に切り詰め、その旨を返す", () => {
    const now = new Date("2026-08-19T00:00:00.000Z");
    const result = resolveCampaignPeriod({
      startsAt: "2026-08-16T23:00:00.000Z",
      endsAt: "2026-09-06T12:59:00.000Z",
      now,
    });

    expect(result).toEqual({
      fromIso: "2026-08-16T23:00:00.000Z",
      toIso: now.toISOString(),
      isOngoing: true,
    });
  });

  test("終了日時が無い企画(常設化)は「今」まで", () => {
    const result = resolveCampaignPeriod({
      startsAt: FASHION_START,
      endsAt: null,
      now: AFTER_FASHION,
    });

    expect(result?.toIso).toBe(AFTER_FASHION.toISOString());
    expect(result?.isOngoing).toBe(false);
  });

  test("開始日時が無ければ null(呼び出し側が従来の既定に落ちる)", () => {
    expect(
      resolveCampaignPeriod({ startsAt: null, endsAt: FASHION_END }),
    ).toBeNull();
    expect(
      resolveCampaignPeriod({ startsAt: undefined, endsAt: undefined }),
    ).toBeNull();
  });

  test("⭐まだ始まっていない企画は null(集計しようがない)", () => {
    expect(
      resolveCampaignPeriod({
        startsAt: "2026-09-01T00:00:00.000Z",
        endsAt: "2026-09-30T00:00:00.000Z",
        now: AFTER_FASHION,
      }),
    ).toBeNull();
  });

  test("開始と同時刻に終わる会期は null(幅がない)", () => {
    expect(
      resolveCampaignPeriod({
        startsAt: FASHION_START,
        endsAt: FASHION_START,
        now: AFTER_FASHION,
      }),
    ).toBeNull();
  });

  test("日付が壊れていたら null(従来の既定に落ちる)", () => {
    expect(
      resolveCampaignPeriod({ startsAt: "not-a-date", endsAt: FASHION_END }),
    ).toBeNull();
  });

  test("終了日時だけ壊れていたら「今」まで扱いにする", () => {
    const result = resolveCampaignPeriod({
      startsAt: FASHION_START,
      endsAt: "not-a-date",
      now: AFTER_FASHION,
    });

    expect(result?.toIso).toBe(AFTER_FASHION.toISOString());
  });
});
