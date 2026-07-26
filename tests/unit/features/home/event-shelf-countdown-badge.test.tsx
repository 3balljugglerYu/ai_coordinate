/** @jest-environment jsdom */

import { act, render, screen } from "@testing-library/react";
import { EventShelfCountdown } from "@/features/home/components/EventShelfCountdown";

jest.mock("next-intl", () => ({
  useTranslations:
    () => (key: string, values?: Record<string, unknown>) => {
      switch (key) {
        case "eventShelfCountdownDaysLeft":
          return `あと${values?.days}日`;
        case "eventShelfCountdownHoursMinutes":
          return `あと${values?.hours}時間${values?.minutes}分`;
        case "eventShelfCountdownMinutes":
          return `あと${values?.minutes}分`;
        default:
          return key;
      }
    },
}));

const BASE_MS = Date.parse("2026-07-26T12:00:00.000Z");
const BASE_ISO = new Date(BASE_MS).toISOString();
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

describe("EventShelfCountdown", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(BASE_MS);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("残り24時間以上_日数バッジ(グレー)を表示する", () => {
    render(
      <EventShelfCountdown
        endsAt={new Date(BASE_MS + 25 * HOUR).toISOString()}
        nowIso={BASE_ISO}
      />,
    );

    const badge = screen.getByText("あと2日");
    expect(badge.className).toContain("bg-gray-200");
    expect(badge.className).not.toContain("bg-red-500");
  });

  test("残り24時間未満_時間+分の赤バッジで1分ごとに更新される", () => {
    render(
      <EventShelfCountdown
        endsAt={new Date(BASE_MS + 3 * HOUR).toISOString()}
        nowIso={BASE_ISO}
      />,
    );

    const badge = screen.getByText("あと3時間0分");
    expect(badge.className).toContain("bg-red-500");

    // 1分経過 → 2時間59分に更新される
    act(() => {
      jest.advanceTimersByTime(MINUTE);
    });
    expect(screen.getByText("あと2時間59分")).toBeTruthy();

    // さらに59分経過(計1時間) → 2時間0分
    act(() => {
      jest.advanceTimersByTime(59 * MINUTE);
    });
    expect(screen.getByText("あと2時間0分")).toBeTruthy();
  });

  test("企画終了時刻_カウントがちょうど0になり1分後に消える", () => {
    render(
      <EventShelfCountdown
        endsAt={new Date(BASE_MS + 2 * MINUTE).toISOString()}
        nowIso={BASE_ISO}
      />,
    );

    expect(screen.getByText("あと2分")).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(MINUTE);
    });
    expect(screen.getByText("あと1分")).toBeTruthy();

    // 終了時刻ちょうど → カウントが0になる
    act(() => {
      jest.advanceTimersByTime(MINUTE);
    });
    expect(screen.getByText("あと0分")).toBeTruthy();

    // 終了から1分後 → バッジが消える
    act(() => {
      jest.advanceTimersByTime(MINUTE);
    });
    expect(screen.queryByText(/あと/)).toBeNull();
  });

  test("分の途中から表示した場合_分の境界で正しく減っていく", () => {
    // 残り1分30秒 → 切り上げで「あと2分」
    render(
      <EventShelfCountdown
        endsAt={new Date(BASE_MS + 90 * 1000).toISOString()}
        nowIso={BASE_ISO}
      />,
    );

    expect(screen.getByText("あと2分")).toBeTruthy();

    // 30秒後(分の境界=残りちょうど1分) → 「あと1分」
    act(() => {
      jest.advanceTimersByTime(30 * 1000);
    });
    expect(screen.getByText("あと1分")).toBeTruthy();

    // さらに1分後(終了時刻ちょうど) → 「あと0分」
    act(() => {
      jest.advanceTimersByTime(MINUTE);
    });
    expect(screen.getByText("あと0分")).toBeTruthy();
  });

  test("endsAtが無い場合_何も表示しない", () => {
    const { container } = render(
      <EventShelfCountdown endsAt={null} nowIso={BASE_ISO} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
