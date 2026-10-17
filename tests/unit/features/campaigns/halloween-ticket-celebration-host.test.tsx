/** @jest-environment jsdom */

/**
 * ハロウィン企画の口数のお祝い(2026-10-17 ユーザー決定)。
 *
 * - 1口・2口・3口に届いたとき、1回ずつ出す(どこまで出したかは DB に残す)
 * - ⭐ ミッションクリアのモーダルと重ねない: 出している間(blocked)は待ち、閉じてから出す。
 *   ほかのモーダルが開いている間も出さない
 * - 読めない・記録できない・描けないときは、何も出さず、外側を止めない
 */

import React from "react";
import { act, render, screen } from "@testing-library/react";

let mockModalShouldThrow = false;

jest.mock("@/features/campaigns/halloween/components/HalloweenTicketCelebrationModal", () => ({
  HalloweenTicketCelebrationModal: ({
    tickets,
    usedWorks,
    onOpenChange,
  }: {
    tickets: number;
    usedWorks: number;
    onOpenChange: (open: boolean) => void;
  }) => {
    if (mockModalShouldThrow) throw new Error("render failed");
    return (
      <div role="dialog" data-testid="celebration">
        <span data-testid="celebration-tickets">{tickets}</span>
        <span data-testid="celebration-works">{usedWorks}</span>
        <button type="button" onClick={() => onOpenChange(false)}>
          閉じる
        </button>
      </div>
    );
  },
}));

jest.mock("@/features/campaigns/lib/campaign-events", () => {
  const actual = jest.requireActual("@/features/campaigns/lib/campaign-events");
  return { ...actual, trackCampaignEvent: jest.fn() };
});

import {
  CELEBRATION_MAX_WAIT_MS,
  CELEBRATION_OPEN_DELAY_MS,
  CELEBRATION_RETRY_MS,
  HalloweenTicketCelebrationHost,
} from "@/features/campaigns/halloween/components/HalloweenTicketCelebrationHost";
import {
  requestTicketCelebrationCheck,
  resetTicketCelebrationRequestsForTest,
} from "@/features/campaigns/halloween/lib/ticket-celebration-requests";
import { CAMPAIGN_EVENTS, trackCampaignEvent } from "@/features/campaigns/lib/campaign-events";

const PROGRESS_URL = "/api/hashtag-campaigns/halloween-best-shot/progress";
const CELEBRATION_URL = "/api/hashtag-campaigns/halloween-best-shot/celebration";
const ENTERED_AT = "2026-10-16T11:00:00.000Z";
/** 期間中(10/16 20:00 〜 10/31 23:59 JST) */
const DURING = new Date("2026-10-20T03:00:00.000Z");

type Viewer = { enteredAt: string | null; usedWorks: number; celebratedTickets: number } | null;

const fetchMock = jest.fn();

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function mockProgress(viewer: Viewer, { recordFails = false }: { recordFails?: boolean } = {}) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === PROGRESS_URL) {
      return json({ startsAt: "2026-10-16T11:00:00.000Z", endsAt: "2026-10-31T15:00:00.000Z", viewer });
    }
    if (url === CELEBRATION_URL) {
      if (recordFails) throw new Error("network");
      return json({ celebratedTickets: 1 });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
}

function entered(usedWorks: number, celebratedTickets = 0): Viewer {
  return { enteredAt: ENTERED_AT, usedWorks, celebratedTickets };
}

/** fetch → json → then の約束ごとを流しきる */
async function flush() {
  await act(async () => {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
    }
  });
}

function advance(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

async function request() {
  act(() => {
    requestTicketCelebrationCheck();
  });
  await flush();
}

function progressCalls() {
  return fetchMock.mock.calls.filter(([url]) => url === PROGRESS_URL).length;
}

function recordCalls() {
  return fetchMock.mock.calls.filter(([url]) => url === CELEBRATION_URL);
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(DURING);
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  resetTicketCelebrationRequestsForTest();
  mockModalShouldThrow = false;
  jest.mocked(trackCampaignEvent).mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("HalloweenTicketCelebrationHost", () => {
  test("合図が来たら確かめ、届いた口数を出して、出したことを1回だけ残す", async () => {
    mockProgress(entered(3));
    render(<HalloweenTicketCelebrationHost blocked={false} />);
    // 合図が来るまでは読まない
    await flush();
    expect(progressCalls()).toBe(0);

    await request();
    expect(progressCalls()).toBe(1);
    // 閉じる動きを見届けるため、少し待ってから出す
    advance(CELEBRATION_OPEN_DELAY_MS - 1);
    expect(screen.queryByTestId("celebration")).toBeNull();
    advance(1);
    expect(screen.getByTestId("celebration-tickets").textContent).toBe("1");
    expect(screen.getByTestId("celebration-works").textContent).toBe("3");

    const records = recordCalls();
    expect(records).toHaveLength(1);
    expect(records[0][1]).toEqual(
      expect.objectContaining({ method: "POST", body: JSON.stringify({ tickets: 1 }) }),
    );
    expect(trackCampaignEvent).toHaveBeenCalledWith(CAMPAIGN_EVENTS.celebrationView);
    expect(trackCampaignEvent).toHaveBeenCalledTimes(1);
  });

  test("⭐ミッションクリアを出している間(blocked)は出さず、閉じてから出す", async () => {
    mockProgress(entered(3));
    const { rerender } = render(<HalloweenTicketCelebrationHost blocked />);
    await request();
    advance(10_000);
    expect(screen.queryByTestId("celebration")).toBeNull();
    expect(recordCalls()).toHaveLength(0);

    rerender(<HalloweenTicketCelebrationHost blocked={false} />);
    advance(CELEBRATION_OPEN_DELAY_MS - 1);
    expect(screen.queryByTestId("celebration")).toBeNull();
    advance(1);
    expect(screen.getByTestId("celebration-tickets").textContent).toBe("1");
  });

  test("⭐待っている間にミッションクリアが出たら、出すのをやめて閉じるまで待つ", async () => {
    mockProgress(entered(3));
    const { rerender } = render(<HalloweenTicketCelebrationHost blocked={false} />);
    await request();
    advance(CELEBRATION_OPEN_DELAY_MS - 100);
    rerender(<HalloweenTicketCelebrationHost blocked />);
    advance(5_000);
    expect(screen.queryByTestId("celebration")).toBeNull();

    rerender(<HalloweenTicketCelebrationHost blocked={false} />);
    advance(CELEBRATION_OPEN_DELAY_MS);
    expect(screen.getByTestId("celebration")).not.toBeNull();
  });

  test("⭐ほかのモーダルが開いている間は出さず、閉じたら出す", async () => {
    mockProgress(entered(3));
    const other = document.createElement("div");
    other.setAttribute("role", "dialog");
    document.body.appendChild(other);
    try {
      render(<HalloweenTicketCelebrationHost blocked={false} />);
      await request();
      advance(CELEBRATION_OPEN_DELAY_MS + CELEBRATION_RETRY_MS * 6);
      expect(screen.queryByTestId("celebration")).toBeNull();
      expect(recordCalls()).toHaveLength(0);

      other.remove();
      advance(CELEBRATION_RETRY_MS);
      expect(screen.getByTestId("celebration")).not.toBeNull();
      // 出たのは1枚だけ
      expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    } finally {
      other.remove();
    }
  });

  test("ほかのモーダルが1分を超えて開いたままなら、この回はあきらめる(次の合図でまた確かめる)", async () => {
    mockProgress(entered(3));
    const other = document.createElement("div");
    other.setAttribute("role", "dialog");
    document.body.appendChild(other);
    try {
      render(<HalloweenTicketCelebrationHost blocked={false} />);
      await request();
      advance(CELEBRATION_OPEN_DELAY_MS + CELEBRATION_MAX_WAIT_MS + CELEBRATION_RETRY_MS);
      other.remove();
      advance(CELEBRATION_RETRY_MS * 4);
      expect(screen.queryByTestId("celebration")).toBeNull();

      await request();
      advance(CELEBRATION_OPEN_DELAY_MS);
      expect(screen.getByTestId("celebration")).not.toBeNull();
    } finally {
      other.remove();
    }
  });

  test("閉じたら消え、同じ口数はこのタブで二度出さない(記録に失敗していても)", async () => {
    mockProgress(entered(3), { recordFails: true });
    render(<HalloweenTicketCelebrationHost blocked={false} />);
    await request();
    advance(CELEBRATION_OPEN_DELAY_MS);
    await flush();
    act(() => {
      screen.getByText("閉じる").click();
    });
    expect(screen.queryByTestId("celebration")).toBeNull();

    // 記録できず、DB はまだ 0 口のまま
    await request();
    advance(CELEBRATION_OPEN_DELAY_MS * 3);
    expect(screen.queryByTestId("celebration")).toBeNull();
  });

  test("次の口数に届いたら、同じタブでもまた出す", async () => {
    mockProgress(entered(3));
    render(<HalloweenTicketCelebrationHost blocked={false} />);
    await request();
    advance(CELEBRATION_OPEN_DELAY_MS);
    act(() => {
      screen.getByText("閉じる").click();
    });

    mockProgress(entered(6, 1));
    await request();
    advance(CELEBRATION_OPEN_DELAY_MS);
    expect(screen.getByTestId("celebration-tickets").textContent).toBe("2");
  });

  test("見逃した口数が2つあっても、出すのはいちばん上の1枚だけ", async () => {
    mockProgress(entered(7, 0));
    render(<HalloweenTicketCelebrationHost blocked={false} />);
    await request();
    advance(CELEBRATION_OPEN_DELAY_MS);
    expect(screen.getAllByTestId("celebration")).toHaveLength(1);
    expect(screen.getByTestId("celebration-tickets").textContent).toBe("2");
    expect(recordCalls()[0][1]).toEqual(expect.objectContaining({ body: JSON.stringify({ tickets: 2 }) }));
  });

  test.each([
    ["エントリーしていない人には", { enteredAt: null, usedWorks: 5, celebratedTickets: 0 }],
    ["未ログインの人には", null],
    ["まだ口数に届いていないときは", { enteredAt: ENTERED_AT, usedWorks: 2, celebratedTickets: 0 }],
    ["その口数をもう出したときは", { enteredAt: ENTERED_AT, usedWorks: 5, celebratedTickets: 1 }],
    ["取り消して減った(出した口数より少ない)ときは", { enteredAt: ENTERED_AT, usedWorks: 2, celebratedTickets: 1 }],
  ])("%s出さない", async (_label, viewer) => {
    mockProgress(viewer as Viewer);
    render(<HalloweenTicketCelebrationHost blocked={false} />);
    await request();
    advance(CELEBRATION_OPEN_DELAY_MS * 3);
    expect(screen.queryByTestId("celebration")).toBeNull();
    expect(recordCalls()).toHaveLength(0);
    expect(trackCampaignEvent).not.toHaveBeenCalled();
  });

  test.each([
    ["始まる前", "2026-10-16T10:59:59.000Z"],
    ["終わったあと", "2026-10-31T15:00:00.000Z"],
  ])("期間外(%s)は読みにも行かない", async (_label, now) => {
    jest.setSystemTime(new Date(now));
    mockProgress(entered(3));
    render(<HalloweenTicketCelebrationHost blocked={false} />);
    await request();
    advance(CELEBRATION_OPEN_DELAY_MS * 3);
    expect(progressCalls()).toBe(0);
    expect(screen.queryByTestId("celebration")).toBeNull();
  });

  test.each([
    ["進み具合を読めない(500)とき", async () => json({}, 500)],
    ["通信が切れたとき", async () => Promise.reject(new Error("network"))],
  ])("%sは何も出さない(投げない)", async (_label, impl) => {
    fetchMock.mockImplementation(impl);
    render(<HalloweenTicketCelebrationHost blocked={false} />);
    await request();
    advance(CELEBRATION_OPEN_DELAY_MS * 3);
    expect(screen.queryByTestId("celebration")).toBeNull();
  });

  test("あとから来た合図の結果を使う(先の合図の古い結果では上書きしない)", async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementation(async (url: string) =>
        url === PROGRESS_URL
          ? json({ startsAt: "", endsAt: "", viewer: entered(6, 0) })
          : json({ celebratedTickets: 2 }),
      );
    render(<HalloweenTicketCelebrationHost blocked={false} />);
    await request();
    await request();
    // 先の合図の結果(1口)があとから届いても、使わない
    resolveFirst(json({ startsAt: "", endsAt: "", viewer: entered(3, 0) }));
    await flush();
    advance(CELEBRATION_OPEN_DELAY_MS);
    expect(screen.getByTestId("celebration-tickets").textContent).toBe("2");
  });

  test("⭐描くときに落ちても、外側は描き続ける", async () => {
    mockProgress(entered(3));
    mockModalShouldThrow = true;
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(
        <div>
          <span data-testid="outside">ミッションクリア</span>
          <HalloweenTicketCelebrationHost blocked={false} />
        </div>,
      );
      await request();
      advance(CELEBRATION_OPEN_DELAY_MS);
      expect(screen.getByTestId("outside").textContent).toBe("ミッションクリア");
      expect(screen.queryByTestId("celebration")).toBeNull();
      expect(errorSpy).toHaveBeenCalledWith("Halloween ticket celebration failed", expect.any(Error));

      // 描けなかったので、出したことは残さない(次に開いたときにまた出せる)
      expect(recordCalls()).toHaveLength(0);
      expect(trackCampaignEvent).not.toHaveBeenCalled();

      // 落ちたあとは、このタブではもう確かめない(読み直して落ちる、を繰り返さない)
      await flush();
      advance(CELEBRATION_OPEN_DELAY_MS * 3);
      await flush();
      advance(CELEBRATION_OPEN_DELAY_MS * 3);
      expect(progressCalls()).toBe(1);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
