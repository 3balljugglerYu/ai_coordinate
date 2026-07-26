import {
  deriveEventShelfCountdown,
  EVENT_COUNTDOWN_HOURS_THRESHOLD_MS,
} from "@/features/home/lib/event-shelf-countdown";

const NOW_MS = Date.parse("2026-07-26T12:00:00.000Z");

function endsIn(ms: number): string {
  return new Date(NOW_MS + ms).toISOString();
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
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

  test("残り24時間未満_時間+分+秒のカウントダウンに切り替わる", () => {
    expect(
      deriveEventShelfCountdown(endsIn(23 * HOUR + 59 * MINUTE + 59 * SECOND), NOW_MS),
    ).toEqual({ type: "countdown", hours: 23, minutes: 59, seconds: 59 });
    expect(deriveEventShelfCountdown(endsIn(90 * MINUTE), NOW_MS)).toEqual({
      type: "countdown",
      hours: 1,
      minutes: 30,
      seconds: 0,
    });
    expect(
      deriveEventShelfCountdown(endsIn(59 * MINUTE + 30 * SECOND), NOW_MS),
    ).toEqual({ type: "countdown", hours: 0, minutes: 59, seconds: 30 });
  });

  test("秒は切り上げ_終了前に0秒と表示されることはない", () => {
    // 残り1ミリ秒でも「あと1秒」
    expect(deriveEventShelfCountdown(endsIn(1), NOW_MS)).toEqual({
      type: "countdown",
      hours: 0,
      minutes: 0,
      seconds: 1,
    });
    // 残り59.5秒 → 切り上げで1分0秒
    expect(
      deriveEventShelfCountdown(endsIn(59 * SECOND + 500), NOW_MS),
    ).toEqual({ type: "countdown", hours: 0, minutes: 1, seconds: 0 });
  });

  test("企画終了時刻ちょうど_カウントが0になる", () => {
    expect(deriveEventShelfCountdown(endsIn(0), NOW_MS)).toEqual({
      type: "countdown",
      hours: 0,
      minutes: 0,
      seconds: 0,
    });
  });

  test("24時間の境界直下_「あと24時間0分0秒」ではなく日数表示に倒す", () => {
    // 23時間59分59.5秒 → 秒の切り上げで86400秒になるため「あと1日」
    expect(
      deriveEventShelfCountdown(
        endsIn(EVENT_COUNTDOWN_HOURS_THRESHOLD_MS - 500),
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
