/** @jest-environment jsdom */

import { act, render, screen } from "@testing-library/react";
import { EventShelfCountdown } from "@/features/home/components/EventShelfCountdown";

jest.mock("next-intl", () => ({
  useTranslations:
    () => (key: string, values?: Record<string, unknown>) => {
      switch (key) {
        case "eventShelfCountdownDaysLeft":
          return `あと${values?.days}日`;
        case "eventShelfCountdownHoursMinutesSeconds":
          return `あと${values?.hours}時間${values?.minutes}分${values?.seconds}秒`;
        case "eventShelfCountdownMinutesSeconds":
          return `あと${values?.minutes}分${values?.seconds}秒`;
        case "eventShelfCountdownSeconds":
          return `あと${values?.seconds}秒`;
        default:
          return key;
      }
    },
}));

const BASE_MS = Date.parse("2026-07-26T12:00:00.000Z");
const BASE_ISO = new Date(BASE_MS).toISOString();
const SECOND = 1000;
const MINUTE = 60 * SECOND;
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

  test("残り24時間未満_時間分秒の赤バッジで1秒ごとに更新される", () => {
    render(
      <EventShelfCountdown
        endsAt={new Date(BASE_MS + 3 * HOUR).toISOString()}
        nowIso={BASE_ISO}
      />,
    );

    const badge = screen.getByText("あと3時間0分0秒");
    expect(badge.className).toContain("bg-red-500");

    // 1秒経過 → 2時間59分59秒に更新される
    act(() => {
      jest.advanceTimersByTime(SECOND);
    });
    expect(screen.getByText("あと2時間59分59秒")).toBeTruthy();

    // さらに59秒経過(計1分) → 2時間59分0秒
    act(() => {
      jest.advanceTimersByTime(59 * SECOND);
    });
    expect(screen.getByText("あと2時間59分0秒")).toBeTruthy();
  });

  test("1時間未満_分秒表示、1分未満_秒のみ表示に切り替わる", () => {
    render(
      <EventShelfCountdown
        endsAt={new Date(BASE_MS + 61 * MINUTE).toISOString()}
        nowIso={BASE_ISO}
      />,
    );

    expect(screen.getByText("あと1時間1分0秒")).toBeTruthy();

    // 1分経過 → 1時間ちょうど
    act(() => {
      jest.advanceTimersByTime(MINUTE);
    });
    expect(screen.getByText("あと1時間0分0秒")).toBeTruthy();

    // さらに1秒 → 59分59秒(時間の桁が消える)
    act(() => {
      jest.advanceTimersByTime(SECOND);
    });
    expect(screen.getByText("あと59分59秒")).toBeTruthy();

    // 59分経過 → 残り59秒(分の桁も消える)
    act(() => {
      jest.advanceTimersByTime(59 * MINUTE);
    });
    expect(screen.getByText("あと59秒")).toBeTruthy();
  });

  test("企画終了時刻_カウントがちょうど0になり1秒後に消える", () => {
    render(
      <EventShelfCountdown
        endsAt={new Date(BASE_MS + 3 * SECOND).toISOString()}
        nowIso={BASE_ISO}
      />,
    );

    expect(screen.getByText("あと3秒")).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(SECOND);
    });
    expect(screen.getByText("あと2秒")).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(SECOND);
    });
    expect(screen.getByText("あと1秒")).toBeTruthy();

    // 終了時刻ちょうど → カウントが0になる
    act(() => {
      jest.advanceTimersByTime(SECOND);
    });
    expect(screen.getByText("あと0秒")).toBeTruthy();

    // 終了から1秒後 → バッジが消える
    act(() => {
      jest.advanceTimersByTime(SECOND);
    });
    expect(screen.queryByText(/あと/)).toBeNull();
  });

  test("秒の途中から表示した場合_秒の境界で正しく減っていく", () => {
    // 残り2.5秒 → 切り上げで「あと3秒」
    render(
      <EventShelfCountdown
        endsAt={new Date(BASE_MS + 2500).toISOString()}
        nowIso={BASE_ISO}
      />,
    );

    expect(screen.getByText("あと3秒")).toBeTruthy();

    // 0.5秒後(秒の境界=残りちょうど2秒) → 「あと2秒」
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(screen.getByText("あと2秒")).toBeTruthy();

    // さらに2秒後(終了時刻ちょうど) → 「あと0秒」
    act(() => {
      jest.advanceTimersByTime(2 * SECOND);
    });
    expect(screen.getByText("あと0秒")).toBeTruthy();
  });

  test("endsAtが無い場合_何も表示しない", () => {
    const { container } = render(
      <EventShelfCountdown endsAt={null} nowIso={BASE_ISO} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
