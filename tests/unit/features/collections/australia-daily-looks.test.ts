/**
 * オーストラリア企画「旅のあいだ」の棚まわり。
 *
 * ここが崩れると (a) 開始前なのにブラーが外れる／開始後もぼけたまま
 * (b) 未登録の ID でページが壊れる、が起きる。
 */

import {
  AUSTRALIA_DAILY_LOOKS,
  AUSTRALIA_SCRAPBOOK_STARTS_AT,
  hasAustraliaScrapbookStarted,
} from "@/features/collections/lib/australia-daily-looks";

describe("hasAustraliaScrapbookStarted", () => {
  test("開始時刻ちょうどから開始扱い(JST 8/29 00:00)", () => {
    expect(
      hasAustraliaScrapbookStarted(new Date("2026-08-29T00:00:00+09:00"))
    ).toBe(true);
  });

  test("1秒前はまだ開始していない(ブラーを維持する)", () => {
    expect(
      hasAustraliaScrapbookStarted(new Date("2026-08-28T23:59:59+09:00"))
    ).toBe(false);
  });

  test("⭐DB の表示期間開始(8/17)ではブラーを外さない", () => {
    /*
      表示期間は前半の案内を先に見せるため 8/17 から開いている。
      これを開始日と取り違えると、企画前にサムネイルが露出する。
    */
    expect(
      hasAustraliaScrapbookStarted(new Date("2026-08-17T08:00:00+09:00"))
    ).toBe(false);
  });

  test("開始後は開始扱いのまま", () => {
    expect(
      hasAustraliaScrapbookStarted(new Date("2026-09-01T12:00:00+09:00"))
    ).toBe(true);
  });

  test("開始日時は JST で解釈される(UTC と取り違えない)", () => {
    // JST 8/29 00:00 = UTC 8/28 15:00
    expect(Date.parse(AUSTRALIA_SCRAPBOOK_STARTS_AT)).toBe(
      Date.parse("2026-08-28T15:00:00Z")
    );
  });
});

describe("AUSTRALIA_DAILY_LOOKS", () => {
  test("presetId が重複していない(棚に同じコーデが2枚出ない)", () => {
    const ids = AUSTRALIA_DAILY_LOOKS.map((look) => look.presetId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("day ラベルが重複していない", () => {
    const days = AUSTRALIA_DAILY_LOOKS.map((look) => look.day);
    expect(new Set(days).size).toBe(days.length);
  });

  test("presetId は UUID 形式(コピペ崩れを弾く)", () => {
    for (const look of AUSTRALIA_DAILY_LOOKS) {
      expect(look.presetId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    }
  });

  test("10日間なので11件以上にはならない", () => {
    expect(AUSTRALIA_DAILY_LOOKS.length).toBeLessThanOrEqual(10);
  });
});
