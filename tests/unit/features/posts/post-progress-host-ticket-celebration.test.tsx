/** @jest-environment jsdom */

/**
 * 投稿のあとの「ミッションクリア！」(PostBonusModal)と、ハロウィン企画の口数のお祝いの順番。
 *
 * ⭐ 2026-10-17 ユーザー「既存のミッションクリアのモーダルとのデグレが起こらないように」。
 * ミッションクリアが先、お祝いは閉じてから。2枚が同時に開くことはない。
 * お祝いの確認が失敗しても、ミッションクリアとトーストは今までどおり出る。
 */

import React from "react";
import { act, render, screen } from "@testing-library/react";
import { PostProgressHost } from "@/features/posts/components/PostProgressHost";
import {
  finishPostProgress,
  resetPostProgressForTest,
} from "@/features/posts/lib/post-progress-store";
import { resetTicketCelebrationRequestsForTest } from "@/features/campaigns/halloween/lib/ticket-celebration-requests";
import { CELEBRATION_OPEN_DELAY_MS } from "@/features/campaigns/halloween/components/HalloweenTicketCelebrationHost";
import type { PostImageResponse } from "@/features/posts/types";

const toastMock = jest.fn();
/** ミッションクリアの見本に role="dialog" を付けるか(付けないと、待つのは blocked の合図だけになる) */
let mockBonusHasDialogRole = true;

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({
      postSuccess: "投稿が完了しました。",
      postSuccessViewAction: "確認する",
      postSubmitting: "投稿中...",
    })[key] ?? key,
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: (...args: unknown[]) => toastMock(...args) }),
}));

jest.mock("@/features/credits/hooks/useUsageRewardAmounts", () => ({
  useUsageRewardAmounts: () => ({ promptUsageRewardAmount: 2, styleUsageRewardAmount: 0 }),
}));

jest.mock("@/features/posts/components/PostBonusModal", () => ({
  PostBonusModal: ({ amount, onOpenChange }: { amount: number; onOpenChange: (open: boolean) => void }) => (
    <div role={mockBonusHasDialogRole ? "dialog" : undefined} data-testid="bonus-modal">
      <span data-testid="bonus-amount">{amount}</span>
      <button type="button" onClick={() => onOpenChange(false)}>
        ミッションクリアを閉じる
      </button>
    </div>
  ),
}));

jest.mock("@/features/campaigns/halloween/components/HalloweenTicketCelebrationModal", () => ({
  HalloweenTicketCelebrationModal: ({ tickets }: { tickets: number }) => (
    <div role="dialog" data-testid="celebration">
      <span data-testid="celebration-tickets">{tickets}</span>
    </div>
  ),
}));

jest.mock("@/features/campaigns/lib/campaign-events", () => {
  const actual = jest.requireActual("@/features/campaigns/lib/campaign-events");
  return { ...actual, trackCampaignEvent: jest.fn() };
});

const PROGRESS_URL = "/api/hashtag-campaigns/halloween-best-shot/progress";
const fetchMock = jest.fn();

function json(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/** エントリー済み・3作品(1口)・まだお祝いしていない */
function mockReachedFirstTicket() {
  fetchMock.mockImplementation(async (url: string) =>
    url === PROGRESS_URL
      ? json({
          startsAt: "2026-10-16T11:00:00.000Z",
          endsAt: "2026-10-31T15:00:00.000Z",
          viewer: { enteredAt: "2026-10-16T11:00:00.000Z", usedWorks: 3, celebratedTickets: 0 },
        })
      : json({ celebratedTickets: 1 }),
  );
}

function response(overrides: Partial<PostImageResponse> = {}): PostImageResponse {
  return {
    id: "post-1",
    is_posted: true,
    caption: null,
    posted_at: "2026-10-20T03:00:00.000Z",
    // 対象作品から作った投稿
    post: { id: "post-1", source_post_id: "target-work-1" },
    ...overrides,
  } as PostImageResponse;
}

async function finish(postResponse: PostImageResponse) {
  act(() => {
    finishPostProgress(postResponse);
  });
  await act(async () => {
    for (let i = 0; i < 8; i++) {
      await Promise.resolve();
    }
  });
}

function advance(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

function openDialogs() {
  return document.querySelectorAll('[role="dialog"]').length;
}

function progressCalls() {
  return fetchMock.mock.calls.filter(([url]) => url === PROGRESS_URL).length;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-10-20T03:00:00.000Z"));
  jest.clearAllMocks();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  resetPostProgressForTest();
  resetTicketCelebrationRequestsForTest();
  mockBonusHasDialogRole = true;
});

afterEach(() => {
  jest.useRealTimers();
});

describe("PostProgressHost とハロウィン企画の口数のお祝い", () => {
  test("⭐ミッションクリアが先に出て、お祝いは閉じてから出る(同時に2枚開かない)", async () => {
    mockReachedFirstTicket();
    render(<PostProgressHost />);
    await finish(response({ bonus_granted: 20 }));

    expect(screen.getByTestId("bonus-amount").textContent).toBe("20");
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(progressCalls()).toBe(1);

    // ミッションクリアを開いている間は、いくら待ってもお祝いは出ない
    advance(10_000);
    expect(screen.queryByTestId("celebration")).toBeNull();
    expect(openDialogs()).toBe(1);

    act(() => {
      screen.getByText("ミッションクリアを閉じる").click();
    });
    expect(screen.queryByTestId("bonus-modal")).toBeNull();
    advance(CELEBRATION_OPEN_DELAY_MS - 1);
    expect(screen.queryByTestId("celebration")).toBeNull();
    advance(1);
    expect(screen.getByTestId("celebration-tickets").textContent).toBe("1");
    expect(openDialogs()).toBe(1);
  });

  test("ミッションクリアを出している間は、画面から見えなくても(blocked の合図だけで)待つ", async () => {
    mockBonusHasDialogRole = false;
    mockReachedFirstTicket();
    render(<PostProgressHost />);
    await finish(response({ bonus_granted: 20 }));

    advance(10_000);
    expect(screen.getByTestId("bonus-modal")).not.toBeNull();
    expect(screen.queryByTestId("celebration")).toBeNull();

    act(() => {
      screen.getByText("ミッションクリアを閉じる").click();
    });
    advance(CELEBRATION_OPEN_DELAY_MS);
    expect(screen.getByTestId("celebration")).not.toBeNull();
  });

  test("ミッションクリアが出ない投稿(付与なし)でも、お祝いは出る", async () => {
    mockReachedFirstTicket();
    render(<PostProgressHost />);
    await finish(response({ bonus_granted: 0, prompt_use_bonus_granted: 0 }));

    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("bonus-modal")).toBeNull();
    advance(CELEBRATION_OPEN_DELAY_MS);
    expect(screen.getByTestId("celebration-tickets").textContent).toBe("1");
  });

  test("ほかの人の作品から作った投稿でなければ(元の作品なし)確かめない。ミッションクリアは今までどおり", async () => {
    mockReachedFirstTicket();
    render(<PostProgressHost />);
    await finish(
      response({
        bonus_granted: 20,
        post: { id: "post-1", source_post_id: null } as PostImageResponse["post"],
      }),
    );

    expect(screen.getByTestId("bonus-amount").textContent).toBe("20");
    expect(progressCalls()).toBe(0);
  });

  test("投稿のカードが返ってこなかったとき(どこから作ったか分からない)は確かめる", async () => {
    mockReachedFirstTicket();
    render(<PostProgressHost />);
    await finish(response({ bonus_granted: 0, post: null }));

    expect(progressCalls()).toBe(1);
    advance(CELEBRATION_OPEN_DELAY_MS);
    expect(screen.getByTestId("celebration")).not.toBeNull();
  });

  test("⭐お祝いの確認が失敗しても、ミッションクリアとトーストは今までどおり出る", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    render(<PostProgressHost />);
    await finish(response({ bonus_granted: 20 }));

    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("bonus-amount").textContent).toBe("20");
    act(() => {
      screen.getByText("ミッションクリアを閉じる").click();
    });
    advance(CELEBRATION_OPEN_DELAY_MS * 3);
    expect(screen.queryByTestId("celebration")).toBeNull();
    expect(openDialogs()).toBe(0);
  });
});
