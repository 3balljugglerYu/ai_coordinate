/**
 * CollectionUnlockDripListener の回帰テスト。
 *
 * - 進捗モーダル表示中に先読み済み(prefetchUnlockAnnouncements)なら、
 *   dismiss イベント後の表示で追加 fetch を行わない(体感待ち短縮の要)。
 * - 先読みが無ければ、従来どおり dismiss イベントを受けてから fetch する(フォールバック)。
 * - いずれの経路でも、段階解放(drip)の判定結果(newlyUnlocked)は同じになる。
 */

import { act, render, screen, waitFor } from "@testing-library/react";
import type { CollectionUnlockAnnouncement } from "@/features/collections/lib/collection-unlock-announcement";
import {
  prefetchUnlockAnnouncements,
  resetUnlockAnnouncementsPrefetchForTests,
} from "@/features/collections/lib/unlock-announcements-prefetch";
import { COLLECTION_PROGRESS_DISMISSED_EVENT } from "@/features/collections/hooks/useCollectionProgress";

const dripSpy = jest.fn();

jest.mock("@/features/collections/components/UnlockModals", () => ({
  UnlockDripModal: (props: unknown) => {
    dripSpy(props);
    return <div data-testid="drip-modal" />;
  },
}));

import { CollectionUnlockDripListener } from "@/features/collections/components/CollectionUnlockDripListener";

const CATEGORY_KEY = "travel_to_italy";

function makeAnnouncement(
  overrides: Partial<CollectionUnlockAnnouncement> = {},
): CollectionUnlockAnnouncement {
  return {
    categoryKey: CATEGORY_KEY,
    categoryDisplayName: "うちの子のイタリア旅行",
    unlockedCount: 2,
    totalCount: 9,
    unlockedPresets: [
      { id: "p0", title: "はじまり", thumbnailUrl: "https://x/p0.png" },
      { id: "p1", title: "Day1", thumbnailUrl: "https://x/p1.png" },
    ],
    prerequisiteKey: "",
    prerequisiteAckCount: 0,
    // sequential: baseline=1(表紙は常時解放) → 初回生成から drip 対象になる。
    baselineUnlockedCount: 1,
    unitLabel: "日",
    heroImagePath: null,
    initialBody: null,
    dripBody: null,
    accentColor: null,
    accentHoverColor: null,
    titleColor: null,
    softColor: null,
    ...overrides,
  };
}

function mockFetchOnce(announcements: CollectionUnlockAnnouncement[]) {
  return jest.fn().mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ announcements }),
  });
}

function dispatchDismissed() {
  act(() => {
    window.dispatchEvent(
      new CustomEvent(COLLECTION_PROGRESS_DISMISSED_EVENT, {
        detail: { categoryKey: CATEGORY_KEY },
      }),
    );
  });
}

describe("CollectionUnlockDripListener", () => {
  beforeEach(() => {
    resetUnlockAnnouncementsPrefetchForTests();
    dripSpy.mockClear();
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("先読み済みなら dismiss 後に追加 fetch せず段階解放モーダルを表示する", async () => {
    const fetchMock = mockFetchOnce([makeAnnouncement()]);
    global.fetch = fetchMock as unknown as typeof fetch;

    // 進捗モーダル表示中に相当する先読み。
    prefetchUnlockAnnouncements();

    render(<CollectionUnlockDripListener />);
    dispatchDismissed();

    await waitFor(() => expect(screen.getByTestId("drip-modal")).toBeInTheDocument());

    // 先読みの1回だけで、dismiss 後に追加のfetchは発生しない。
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const props = dripSpy.mock.calls[0][0];
    expect(props.newlyUnlocked).toEqual([
      { id: "p1", title: "Day1", thumbnailUrl: "https://x/p1.png" },
    ]);
  });

  it("先読みが無ければ dismiss イベントを受けてから fetch する(フォールバック)", async () => {
    const fetchMock = mockFetchOnce([makeAnnouncement()]);
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<CollectionUnlockDripListener />);
    expect(fetchMock).not.toHaveBeenCalled();

    dispatchDismissed();

    await waitFor(() => expect(screen.getByTestId("drip-modal")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("該当カテゴリの解放お知らせが無ければ表示しない", async () => {
    const fetchMock = mockFetchOnce([
      makeAnnouncement({ categoryKey: "other-category" }),
    ]);
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<CollectionUnlockDripListener />);
    dispatchDismissed();

    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId("drip-modal")).not.toBeInTheDocument();
  });
});
