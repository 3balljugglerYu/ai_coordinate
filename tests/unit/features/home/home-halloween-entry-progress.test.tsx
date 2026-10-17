/** @jest-environment jsdom */

/**
 * ホームの「ハロウィン企画」の棚の上に出す、エントリーした人の進み具合(2026-10-17 ユーザー決定)。
 * 3案から「文字とバーだけ」、バーは「薄い枠」。数え方と色は企画ページの進み具合と同じ。
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { HomeHalloweenEntryProgress } from "@/features/home/components/HomeHalloweenEntryProgress";
import { HALLOWEEN_BEST_SHOT } from "@/features/campaigns/halloween/halloween-best-shot";

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

const gtag = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (window as unknown as { gtag?: unknown }).gtag = gtag;
});

afterEach(() => {
  delete (window as unknown as { gtag?: unknown }).gtag;
});

function texts() {
  return {
    now: screen.getByTestId("home-halloween-entry-progress-now").textContent,
    next: screen.getByTestId("home-halloween-entry-progress-next").textContent,
  };
}

function cells() {
  return Array.from(screen.getByRole("progressbar").children) as HTMLElement[];
}

describe("ホームの進み具合", () => {
  test("⭐4作品なら「現在 4作品(1口)」「あと2作品で2口！」、バーは4段", () => {
    render(<HomeHalloweenEntryProgress usedWorks={4} />);

    expect(screen.getByTestId("home-halloween-entry-progress").textContent).toContain("✓ エントリー中");
    expect(texts()).toEqual({ now: "現在 4作品(1口)", next: "あと2作品で2口！" });
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("4");
    expect(bar.getAttribute("aria-valuemax")).toBe("10");
    expect(bar.getAttribute("aria-valuetext")).toBe("10作品中4作品(1口)");
    expect(cells().map((cell) => cell.dataset.filled)).toEqual([
      "true", "true", "true", "true", "false", "false", "false", "false", "false", "false",
    ]);
  });

  test("口数が増える段(3・6・10)に目印を付ける(企画ページと同じ)", () => {
    render(<HomeHalloweenEntryProgress usedWorks={0} />);

    const goals = cells()
      .map((cell, index) => (cell.dataset.goal === "true" ? index + 1 : null))
      .filter((step) => step !== null);
    expect(goals).toEqual(HALLOWEEN_BEST_SHOT.tickets.map((tier) => tier.works));
  });

  test.each([
    [0, "現在 0作品(0口)", "あと3作品で1口！"],
    [2, "現在 2作品(0口)", "あと1作品で1口！"],
    [3, "現在 3作品(1口)", "あと3作品で2口！"],
    [6, "現在 6作品(2口)", "あと4作品で3口！"],
    [9, "現在 9作品(2口)", "あと1作品で3口！"],
  ])("%i作品なら「%s」「%s」", (works, now, next) => {
    render(<HomeHalloweenEntryProgress usedWorks={works} />);

    expect(texts()).toEqual({ now, next });
  });

  test("10作品で「3口達成！」。10を超えてもバーは10段まで", () => {
    render(<HomeHalloweenEntryProgress usedWorks={12} />);

    expect(texts()).toEqual({ now: "現在 12作品(3口)", next: "3口達成！おめでとうございます🎉" });
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("10");
    expect(cells().every((cell) => cell.dataset.filled === "true")).toBe(true);
  });

  test("マイナスの数が来ても0として出す", () => {
    render(<HomeHalloweenEntryProgress usedWorks={-1} />);

    expect(texts().now).toBe("現在 0作品(0口)");
  });

  test("押すと企画ページへ。押したことを GA4 に送る", () => {
    render(<HomeHalloweenEntryProgress usedWorks={4} />);
    const link = screen.getByTestId("home-halloween-entry-progress");

    expect(link.getAttribute("href")).toBe(HALLOWEEN_BEST_SHOT.path);
    fireEvent.click(link);
    expect(gtag).toHaveBeenCalledWith("event", "campaign_home_progress_tap", {});
  });
});
