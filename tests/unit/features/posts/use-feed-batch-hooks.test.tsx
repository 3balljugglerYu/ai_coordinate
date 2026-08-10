/**
 * フィード用バッチ取得フックのテスト。
 *
 * ここが誤ると、グリッドで大量に読み込んだあとフィードへ切り替えたときに
 * 上限を超えた投稿の CTA やフォローボタンが永久に出ないままになる
 * （posts が変わらない限り effect は再実行されないため）。
 */

import { renderHook, waitFor } from "@testing-library/react";
import { useFeedPromptActions } from "@/features/posts/hooks/useFeedPromptActions";
import { useFeedFollowStatus } from "@/features/posts/hooks/useFeedFollowStatus";

function ids(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}-${index}`);
}

/** 送られた body をすべて記録する fetch。 */
function mockFetch(buildBody: (sent: string[]) => unknown) {
  const bodies: string[][] = [];
  const fetchMock = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const parsed = JSON.parse(String(init?.body)) as {
      post_ids?: string[];
      user_ids?: string[];
    };
    const sent = parsed.post_ids ?? parsed.user_ids ?? [];
    bodies.push(sent);
    return {
      ok: true,
      status: 200,
      json: async () => buildBody(sent),
    } as Response;
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return { fetchMock, bodies };
}

describe("useFeedPromptActions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("グリッド表示中は取得しない(コストを増やさない)", () => {
    const { fetchMock } = mockFetch(() => ({ summaries: {} }));

    renderHook(() => useFeedPromptActions(ids("post", 3), false));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("上限(50件)を超えても全件を分割して取得する", async () => {
    const { bodies } = mockFetch((sent) => ({
      summaries: Object.fromEntries(
        sent.map((id) => [
          id,
          {
            originPostId: id,
            isAvailable: true,
            originAuthorId: "author",
            originAuthorNickname: null,
            usageCount: 0,
            promptVisibility: "private",
          },
        ])
      ),
    }));

    const postIds = ids("post", 120);
    const { result } = renderHook(() => useFeedPromptActions(postIds, true));

    await waitFor(() => {
      expect(Object.keys(result.current)).toHaveLength(120);
    });
    // 50 / 50 / 20 の3リクエストに分かれる
    expect(bodies.map((body) => body.length)).toEqual([50, 50, 20]);
  });

  test("取得済みの投稿は問い合わせ直さない", async () => {
    const { bodies } = mockFetch(() => ({ summaries: {} }));

    const first = ids("post", 3);
    const { rerender } = renderHook(({ list }) => useFeedPromptActions(list, true), {
      initialProps: { list: first },
    });

    await waitFor(() => expect(bodies).toHaveLength(1));

    rerender({ list: [...first, "post-3"] });

    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toEqual(["post-3"]);
  });

  test("取得中に依存配列が変わっても結果を捨てない", async () => {
    /*
      無限スクロールで posts が伸びると postIds が作り直される。effect ごとの
      cancelled フラグで中断すると、進行中の取得が丸ごと破棄されて CTA が
      出ないまま残る。中断はアンマウント時だけに限る。
    */
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    global.fetch = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const sent = (JSON.parse(String(init?.body)) as { post_ids: string[] }).post_ids;
      await gate;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          summaries: Object.fromEntries(
            sent.map((id) => [
              id,
              {
                originPostId: id,
                isAvailable: true,
                originAuthorId: "author",
                originAuthorNickname: null,
                usageCount: 0,
                promptVisibility: "private",
              },
            ])
          ),
        }),
      } as Response;
    }) as unknown as typeof fetch;

    const { result, rerender } = renderHook(
      ({ items }) => useFeedPromptActions(items, true),
      { initialProps: { items: ["post-0"] } }
    );

    // 取得中に別配列で再レンダー(サマリ到着や追加読み込みで起きる)
    rerender({ items: ["post-0", "post-1"] });
    release?.();

    await waitFor(() => {
      expect(result.current["post-0"]).toBeDefined();
    });
  });

  test("失敗した投稿は再取得できるよう戻す", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const failing = jest.fn(async () => ({ ok: false, status: 500 }) as Response);
    global.fetch = failing as unknown as typeof fetch;

    const list = ids("post", 2);
    const { rerender } = renderHook(({ items }) => useFeedPromptActions(items, true), {
      initialProps: { items: list },
    });

    await waitFor(() => expect(failing).toHaveBeenCalledTimes(1));

    // 別の配列参照で再実行すると、失敗ぶんがもう一度送られる
    rerender({ items: [...list] });

    await waitFor(() => expect(failing).toHaveBeenCalledTimes(2));
    errorSpy.mockRestore();
  });
});

describe("useFeedFollowStatus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("未ログインでは取得しない", () => {
    const { fetchMock } = mockFetch(() => ({ following: {} }));

    renderHook(() => useFeedFollowStatus(ids("user", 3), null, true));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("上限(100件)を超えても全件を分割して取得する", async () => {
    const { bodies } = mockFetch((sent) => ({
      following: Object.fromEntries(sent.map((id) => [id, false])),
    }));

    const { result } = renderHook(() =>
      useFeedFollowStatus(ids("user", 250), "viewer-1", true)
    );

    await waitFor(() => {
      expect(Object.keys(result.current.followStatuses)).toHaveLength(250);
    });
    expect(bodies.map((body) => body.length)).toEqual([100, 100, 50]);
  });

  test("自分自身は問い合わせない", async () => {
    const { bodies } = mockFetch(() => ({ following: {} }));

    renderHook(() => useFeedFollowStatus(["viewer-1", "user-1"], "viewer-1", true));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual(["user-1"]);
  });

  test("ログインし直したら前の閲覧者の状態を捨てる", async () => {
    const { bodies } = mockFetch((sent) => ({
      following: Object.fromEntries(sent.map((id) => [id, true])),
    }));

    const { result, rerender } = renderHook(
      ({ viewer }) => useFeedFollowStatus(["user-1"], viewer, true),
      { initialProps: { viewer: "viewer-1" } }
    );

    await waitFor(() => expect(result.current.followStatuses["user-1"]).toBe(true));

    rerender({ viewer: "viewer-2" });

    await waitFor(() => expect(bodies).toHaveLength(2));
  });
});
