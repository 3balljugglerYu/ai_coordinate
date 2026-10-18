/** @jest-environment jsdom */

/**
 * ハロウィン企画の口数のお祝い(2026-10-17 ユーザー決定: 実画面の3案から「ハロウィンの夜」)。
 *
 * - 1口・2口: 次の目標(あと○作品で○口！)と「対象作品をもっと見る」
 * - 3口(いちばん多い): 紙吹雪(10/15 ユーザー「3口は特に派手に」)。もう増えないので「閉じる」だけ
 * - Amazon の名前と「ゲット」は出さない(アマギフ企画の決まり)
 */

import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { HalloweenTicketCelebrationModal } from "@/features/campaigns/halloween/components/HalloweenTicketCelebrationModal";
import { CAMPAIGN_EVENTS, trackCampaignEvent } from "@/features/campaigns/lib/campaign-events";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    onClick,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  }) => (
    <a
      href={href}
      {...rest}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
    >
      {children}
    </a>
  ),
}));

jest.mock("@/features/campaigns/lib/campaign-events", () => {
  const actual = jest.requireActual("@/features/campaigns/lib/campaign-events");
  return { ...actual, trackCampaignEvent: jest.fn() };
});

const trackMock = trackCampaignEvent as jest.MockedFunction<typeof trackCampaignEvent>;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

function renderModal(tickets: number, usedWorks: number, open = true) {
  const onOpenChange = jest.fn();
  const view = render(
    <HalloweenTicketCelebrationModal
      open={open}
      onOpenChange={onOpenChange}
      tickets={tickets}
      usedWorks={usedWorks}
    />,
  );
  return { onOpenChange, ...view };
}

function dialog() {
  return screen.getByRole("dialog");
}

/** 読み上げで使う見出しと説明(aria-labelledby / aria-describedby の先) */
function accessibleTexts() {
  const d = dialog();
  const title = document.getElementById(d.getAttribute("aria-labelledby") ?? "");
  const description = document.getElementById(d.getAttribute("aria-describedby") ?? "");
  return { title: title?.textContent, description: description?.textContent };
}

/** 空の段の色(企画ページの進み具合と同じ) */
const EMPTY_CELL_COLOR = "rgba(61, 16, 80, 0.08)";

/**
 * 色の付いた段の数。目印(data-filled)だけでなく、見た目の色でも数えて一致を確かめる
 * (jsdom はグラデーションを読めないので、空の段の色でないものを数える)
 */
function filledCells() {
  const cells = Array.from(dialog().querySelectorAll<HTMLElement>("[data-filled]"));
  expect(cells).toHaveLength(10);
  const painted = cells.filter((cell) => cell.style.backgroundColor !== EMPTY_CELL_COLOR).length;
  const marked = cells.filter((cell) => cell.dataset.filled === "true").length;
  expect(painted).toBe(marked);
  return painted;
}

function confetti() {
  return document.querySelector('[data-testid="collection-confetti"]');
}

describe("口数のお祝い(ハロウィンの夜)", () => {
  test("1口: 届いた口数・抽選に参加中の口数・使った作品数・次の目標を出す", () => {
    renderModal(1, 3);

    expect(accessibleTexts()).toEqual({
      title: "1口達成！",
      description: "エンジョイ部門の抽選に、1口で参加中です",
    });
    expect(dialog().textContent).toContain("ちがう対象作品を3作品使いました");
    expect(dialog().textContent).toContain("あと3作品で2口！");
    expect(dialog().textContent).toContain("🎃");
    expect(dialog().textContent).not.toContain("🎉");
    expect(filledCells()).toBe(3);
  });

  test("2口: 次は3口", () => {
    renderModal(2, 6);

    expect(accessibleTexts().title).toBe("2口達成！");
    expect(accessibleTexts().description).toBe("エンジョイ部門の抽選に、2口で参加中です");
    expect(dialog().textContent).toContain("あと4作品で3口！");
    expect(filledCells()).toBe(6);
  });

  test("口数の段より多く使っていれば(4作品で1口)、その分バーが伸び、次までの数が減る", () => {
    renderModal(1, 4);

    expect(dialog().textContent).toContain("ちがう対象作品を4作品使いました");
    expect(dialog().textContent).toContain("あと2作品で2口！");
    expect(filledCells()).toBe(4);
  });

  test("1口・2口: 「対象作品をもっと見る」はみんなのカタログの企画タブへ。押すと GA に送って閉じる", () => {
    const { onOpenChange } = renderModal(1, 3);

    const link = screen.getByRole("link", { name: "対象作品をもっと見る" });
    expect(link.getAttribute("href")).toBe("/user-styles?campaign=halloween-best-shot");
    fireEvent.click(link);

    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith(CAMPAIGN_EVENTS.celebrationCatalog);
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test("「閉じる」は下のボタンと右上の×。どちらでも閉じる(GA には送らない)", () => {
    const { onOpenChange } = renderModal(1, 3);

    const closes = screen.getAllByRole("button", { name: "閉じる" });
    expect(closes).toHaveLength(2);
    for (const button of closes) {
      fireEvent.click(button);
    }

    expect(onOpenChange.mock.calls).toEqual([[false], [false]]);
    expect(trackMock).not.toHaveBeenCalled();
  });

  test("⭐3口: いちばん多い口数。紙吹雪を出し、ボタンは「閉じる」だけ(もう増えないので対象作品へは誘わない)", () => {
    const { onOpenChange } = renderModal(3, 10);

    expect(accessibleTexts().title).toBe("3口達成！");
    expect(accessibleTexts().description).toBe("エンジョイ部門の抽選に、3口で参加中です");
    expect(dialog().textContent).toContain("いちばん多い3口です。結果発表をお楽しみに！");
    expect(dialog().textContent).not.toContain("あと");
    expect(dialog().textContent).toContain("🎉");
    expect(filledCells()).toBe(10);
    expect(screen.queryByRole("link", { name: "対象作品をもっと見る" })).toBeNull();

    // 紙吹雪は、モーダルが出きってから(250ms)
    expect(confetti()).toBeNull();
    act(() => {
      jest.advanceTimersByTime(249);
    });
    expect(confetti()).toBeNull();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(confetti()).not.toBeNull();

    const closes = screen.getAllByRole("button", { name: "閉じる" });
    expect(closes).toHaveLength(2);
    fireEvent.click(closes[0]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  test.each([
    [1, 3],
    [2, 6],
  ])("%i口では紙吹雪を出さない", (tickets, works) => {
    renderModal(tickets, works);
    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(confetti()).toBeNull();
  });

  test("3口より多く使っても(12作品)、バーは10段でいっぱい・いちばん多い3口のまま", () => {
    renderModal(3, 12);

    expect(filledCells()).toBe(10);
    expect(dialog().textContent).toContain("ちがう対象作品を12作品使いました");
    expect(dialog().textContent).toContain("いちばん多い3口です。結果発表をお楽しみに！");
  });

  test("開いていないときは何も出さない(紙吹雪も)", () => {
    renderModal(3, 10, false);

    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(confetti()).toBeNull();
  });

  test("開いたときは、ボタンでなくモーダルそのものにフォーカスを置く(ボタンに青い枠を出さない)", () => {
    renderModal(1, 3);

    expect(document.activeElement).toBe(screen.getByTestId("halloween-ticket-celebration"));
  });

  test("Amazon の名前と「ゲット」は出さない(アマギフ企画の決まり)", () => {
    for (const [tickets, works] of [
      [1, 3],
      [2, 6],
      [3, 10],
    ]) {
      const { unmount } = renderModal(tickets, works);
      act(() => {
        jest.advanceTimersByTime(1_000);
      });
      const text = document.body.textContent ?? "";
      expect(text).not.toMatch(/Amazon|アマゾン|ゲット/);
      unmount();
    }
  });
});
