/**
 * @jest-environment jsdom
 */

/**
 * 企画ページの進捗カードから、口数のお祝いの確認を頼む(2026-10-17)。
 *
 * - 見逃した口数のお祝いは、企画ページを開いたときに出す(ホームはポップアップと重なるので出さない)
 * - エントリー前の投稿も数えるので、エントリーしたその場で口数に届いていることがある
 * - お祝いを出すのは PostProgressHost の中だけ。カードは頼むだけ
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EntryProgressCard } from "@/features/campaigns/halloween/components/EntryProgressCard";
import {
  getTicketCelebrationRequestCount,
  resetTicketCelebrationRequestsForTest,
} from "@/features/campaigns/halloween/lib/ticket-celebration-requests";

const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), refresh: mockRefresh }) }));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const STARTS = "2026-10-16T11:00:00.000Z";
const ENDS = "2026-10-31T15:00:00.000Z";
const DURING = () => Date.parse("2026-10-26T15:00:00.000Z");

type Viewer = { enteredAt: string | null; usedWorks: number; celebratedTickets: number } | null;

function progress(viewer: Viewer) {
  return { ok: true, status: 200, json: async () => ({ startsAt: STARTS, endsAt: ENDS, viewer }) };
}

function mockFetch(...responses: unknown[]) {
  const fetchMock = jest.fn();
  for (const response of responses) {
    fetchMock.mockImplementationOnce(async () => response);
  }
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

beforeEach(() => {
  resetTicketCelebrationRequestsForTest();
});

afterEach(() => {
  // @ts-expect-error テストごとに置き換えた fetch を戻す
  delete global.fetch;
});

describe("EntryProgressCard からのお祝いの確認", () => {
  test("エントリー済みなら、読み終わったときに1回頼む", async () => {
    mockFetch(progress({ enteredAt: STARTS, usedWorks: 4, celebratedTickets: 0 }));
    render(<EntryProgressCard now={DURING} />);
    await screen.findByTestId("halloween-entry-now");
    expect(getTicketCelebrationRequestCount()).toBe(1);
  });

  test.each([
    ["未エントリー", { enteredAt: null, usedWorks: 4, celebratedTickets: 0 }],
    ["未ログイン", null],
  ])("%sなら頼まない", async (_label, viewer) => {
    mockFetch(progress(viewer as Viewer));
    render(<EntryProgressCard now={DURING} />);
    await screen.findByTestId("halloween-entry-card");
    expect(getTicketCelebrationRequestCount()).toBe(0);
  });

  test("読めなければ頼まない", async () => {
    mockFetch({ ok: false, status: 500, json: async () => ({}) });
    render(<EntryProgressCard now={DURING} />);
    await screen.findByText("エントリーの状況を読み込めませんでした。");
    expect(getTicketCelebrationRequestCount()).toBe(0);
  });

  test("エントリーできたら、その場で頼む(エントリー前の投稿で届いていることがある)", async () => {
    mockFetch(progress({ enteredAt: null, usedWorks: 3, celebratedTickets: 0 }), {
      ok: true,
      status: 200,
      json: async () => ({ enteredAt: "2026-10-26T15:00:00.000Z" }),
    });
    render(<EntryProgressCard now={DURING} />);
    fireEvent.click(await screen.findByText("エントリーする"));
    await screen.findByText("✓ エントリー済み");
    await waitFor(() => expect(getTicketCelebrationRequestCount()).toBe(1));
  });

  test("エントリーできなければ頼まない", async () => {
    mockFetch(progress({ enteredAt: null, usedWorks: 3, celebratedTickets: 0 }), {
      ok: false,
      status: 409,
      json: async () => ({}),
    });
    render(<EntryProgressCard now={DURING} />);
    fireEvent.click(await screen.findByText("エントリーする"));
    await screen.findByText("エントリーの受付は終了しました");
    expect(getTicketCelebrationRequestCount()).toBe(0);
  });
});
