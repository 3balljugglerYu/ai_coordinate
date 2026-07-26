import {
  deriveEventShelfCountdown,
  EVENT_COUNTDOWN_HOURS_THRESHOLD_MS,
} from "@/features/home/lib/event-shelf-countdown";

const NOW_MS = Date.parse("2026-07-26T12:00:00.000Z");

function endsIn(ms: number): string {
  return new Date(NOW_MS + ms).toISOString();
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("deriveEventShelfCountdown", () => {
  test("残り24時間以上_日数表示(切り上げ)を返す", () => {
    expect(deriveEventShelfCountdown(endsIn(25 * HOUR), NOW_MS)).toEqual({
      type: "days",
      days: 2,
    });
    expect(deriveEventShelfCountdown(endsIn(3 * DAY), NOW_MS)).toEqual({
      type: "days",
      days: 3,
    });
    // ちょうど24時間は日数表示側(「あと1日」)
    expect(
      deriveEventShelfCountdown(endsIn(EVENT_COUNTDOWN_HOURS_THRESHOLD_MS), NOW_MS),
    ).toEqual({ type: "days", days: 1 });
  });

  test("残り24時間未満_時間+分のカウントダウンに切り替わる", () => {
    expect(
      deriveEventShelfCountdown(endsIn(23 * HOUR + 59 * MINUTE), NOW_MS),
    ).toEqual({ type: "hoursMinutes", hours: 23, minutes: 59 });
    expect(deriveEventShelfCountdown(endsIn(90 * MINUTE), NOW_MS)).toEqual({
      type: "hoursMinutes",
      hours: 1,
      minutes: 30,
    });
  });

  test("分は切り上げ_終了前に0分と表示されることはない", () => {
    // 残り1秒でも「あと1分」
    expect(deriveEventShelfCountdown(endsIn(1000), NOW_MS)).toEqual({
      type: "hoursMinutes",
      hours: 0,
      minutes: 1,
    });
    // 残り59分30秒 → 切り上げで1時間0分ではなく60分=1時間0分
    expect(
      deriveEventShelfCountdown(endsIn(59 * MINUTE + 30 * 1000), NOW_MS),
    ).toEqual({ type: "hoursMinutes", hours: 1, minutes: 0 });
  });

  test("企画終了時刻ちょうど_カウントが0になる", () => {
    expect(deriveEventShelfCountdown(endsIn(0), NOW_MS)).toEqual({
      type: "hoursMinutes",
      hours: 0,
      minutes: 0,
    });
  });

  test("24時間の境界直下_「あと24時間0分」ではなく日数表示に倒す", () => {
    // 23時間59分1秒 → 分の切り上げで1440分になるため「あと1日」
    expect(
      deriveEventShelfCountdown(
        endsIn(EVENT_COUNTDOWN_HOURS_THRESHOLD_MS - 1000),
        NOW_MS,
      ),
    ).toEqual({ type: "days", days: 1 });
  });

  test("終了後・endsAt無し・不正日時_nullを返す(バッジ非表示)", () => {
    expect(deriveEventShelfCountdown(endsIn(-1000), NOW_MS)).toBeNull();
    expect(deriveEventShelfCountdown(null, NOW_MS)).toBeNull();
    expect(deriveEventShelfCountdown("invalid-date", NOW_MS)).toBeNull();
  });
});
