import { act, renderHook, waitFor } from "@testing-library/react";
import {
  COLLECTION_PROGRESS_DISMISSED_EVENT,
  COLLECTION_PROGRESS_REFRESH_EVENT,
  useCollectionProgress,
} from "@/features/collections/hooks/useCollectionProgress";
import type { CollectionProgress } from "@/features/collections/lib/collection-types";

const WAFER_KEY = "collectible_wafer_sticker_god_6p";

function makeSeries(
  overrides: Partial<CollectionProgress> = {},
): CollectionProgress {
  return {
    categoryId: "cat-1",
    categoryKey: WAFER_KEY,
    displayNameJa: "神コレクション",
    displayNameEn: "God Collection",
    completionThreshold: 6,
    uniqueOutfitCount: 6,
    isCompleted: true,
    mountStatus: "completed",
    mountImagePath: "path/to/mount.png",
    completedAt: "2026-06-13T00:00:00Z",
    characterImageUrl: null,
    collectedImageUrls: ["u0", "u1", "u2", "u3", "u4", "u5"],
    completionId: "comp-1",
    ...overrides,
  };
}

function mockProgressResponse(body: {
  items?: CollectionProgress[];
  isAdminViewer?: boolean;
}) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  }) as unknown as typeof fetch;
}

function setUrl(url: string) {
  window.history.replaceState({}, "", url);
}

describe("useCollectionProgress の admin プレビュー", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setUrl("/");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("admin + collection_to で指定個数の進捗ビューを再表示する", async () => {
    mockProgressResponse({ items: [makeSeries()], isAdminViewer: true });
    setUrl(`/ja?collection_reset=${WAFER_KEY}&collection_to=4`);

    const { result } = renderHook(() => useCollectionProgress());

    await waitFor(() => expect(result.current.celebration).not.toBeNull());
    const c = result.current.celebration!;
    expect(c.categoryKey).toBe(WAFER_KEY);
    expect(c.toCount).toBe(4);
    expect(c.fromCount).toBe(0);
    // to(4) < threshold(6) なので進捗ビューを強制(完了ビューに切り替えない)
    expect(c.isCompleted).toBe(false);
    expect(c.mountImageUrl).toBeNull();
    expect(c.completionId).toBeNull();
    // collectedImageUrls は to 件に切り詰める
    expect(c.collectedImageUrls).toHaveLength(4);
  });

  it("collection_from で開始カウントを指定できる(4個目が埋まる瞬間)", async () => {
    mockProgressResponse({ items: [makeSeries()], isAdminViewer: true });
    setUrl(`/ja?collection_reset=1&collection_to=4&collection_from=3`);

    const { result } = renderHook(() => useCollectionProgress());

    await waitFor(() => expect(result.current.celebration).not.toBeNull());
    expect(result.current.celebration!.fromCount).toBe(3);
    expect(result.current.celebration!.toCount).toBe(4);
  });

  it("key=1 は先頭シリーズを対象にする", async () => {
    const other = makeSeries({
      categoryKey: "other-series",
      categoryId: "cat-other",
    });
    mockProgressResponse({ items: [other], isAdminViewer: true });
    setUrl(`/ja?collection_reset=1&collection_to=2`);

    const { result } = renderHook(() => useCollectionProgress());

    await waitFor(() => expect(result.current.celebration).not.toBeNull());
    expect(result.current.celebration!.categoryKey).toBe("other-series");
  });

  it("to を threshold より大きく指定しても threshold で頭打ちにする", async () => {
    mockProgressResponse({ items: [makeSeries()], isAdminViewer: true });
    setUrl(`/ja?collection_reset=${WAFER_KEY}&collection_to=99`);

    const { result } = renderHook(() => useCollectionProgress());

    await waitFor(() => expect(result.current.celebration).not.toBeNull());
    const c = result.current.celebration!;
    expect(c.toCount).toBe(6);
    // to >= threshold かつ実データが完了済みなら完了ビューを尊重する
    expect(c.isCompleted).toBe(true);
  });

  it("非 admin では collection_reset を無視する", async () => {
    mockProgressResponse({
      items: [makeSeries({ uniqueOutfitCount: 6 })],
      isAdminViewer: false,
    });
    // ack を現在数に合わせ、通常フローでも発火しないようにする
    window.localStorage.setItem(`collection-ack:${WAFER_KEY}`, "6");
    setUrl(`/ja?collection_reset=${WAFER_KEY}&collection_to=4`);

    const { result } = renderHook(() => useCollectionProgress());

    // しばらく待っても celebration は出ない
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.celebration).toBeNull();
  });

  it("admin でも collection_reset のキーに一致するシリーズが無ければ表示しない", async () => {
    mockProgressResponse({
      items: [makeSeries({ categoryKey: "other-series" })],
      isAdminViewer: true,
    });
    setUrl(`/ja?collection_reset=does-not-exist&collection_to=4`);

    const { result } = renderHook(() => useCollectionProgress());

    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.celebration).toBeNull();
  });

  it("dismiss すると COLLECTION_PROGRESS_DISMISSED_EVENT を categoryKey 付きで発火する", async () => {
    // ack=0 + 進捗(uniqueOutfitCount=1)で celebration を出す。
    mockProgressResponse({
      items: [
        makeSeries({
          uniqueOutfitCount: 1,
          isCompleted: false,
          mountStatus: null,
          mountImagePath: null,
          completionId: null,
          collectedImageUrls: [],
        }),
      ],
      isAdminViewer: false,
    });
    window.localStorage.setItem(`collection-ack:${WAFER_KEY}`, "0");
    setUrl("/ja");

    const { result } = renderHook(() => useCollectionProgress());
    await waitFor(() => expect(result.current.celebration).not.toBeNull());

    const handler = jest.fn();
    window.addEventListener(COLLECTION_PROGRESS_DISMISSED_EVENT, handler);
    act(() => {
      result.current.dismiss();
    });
    window.removeEventListener(COLLECTION_PROGRESS_DISMISSED_EVENT, handler);

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent<{
      categoryKey: string;
    }>;
    expect(event.detail.categoryKey).toBe(WAFER_KEY);
    // モーダルは閉じている。
    expect(result.current.celebration).toBeNull();
  });

  it("プレビューは ack を変更しない(実進捗を汚さない)", async () => {
    window.localStorage.setItem(`collection-ack:${WAFER_KEY}`, "2");
    mockProgressResponse({ items: [makeSeries()], isAdminViewer: true });
    setUrl(`/ja?collection_reset=${WAFER_KEY}&collection_to=4`);

    const { result } = renderHook(() => useCollectionProgress());

    await waitFor(() => expect(result.current.celebration).not.toBeNull());
    expect(window.localStorage.getItem(`collection-ack:${WAFER_KEY}`)).toBe("2");
  });
});

describe("useCollectionProgress の即時イベント リトライ(読み取り競合対策)", () => {
  const progressSeries = (count: number): CollectionProgress =>
    makeSeries({
      uniqueOutfitCount: count,
      isCompleted: false,
      mountStatus: null,
      mountImagePath: null,
      completionId: null,
      collectedImageUrls: [],
    });

  const okJson = (items: CollectionProgress[]) => ({
    ok: true,
    json: async () => ({ items, isAdminViewer: false }),
  });

  const flushMicrotasks = async () => {
    for (let i = 0; i < 6; i += 1) {
      await Promise.resolve();
    }
  };

  beforeEach(() => {
    window.localStorage.clear();
    setUrl("/");
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("生成直後にカウント未反映でも、バックオフ再評価で進捗モーダルを表示する", async () => {
    // 既に1種は通知済み(ack=1)。新しいプリセット生成で 2 になるはずだが、
    // 即時イベント時点では RPC にまだ反映されておらず 1 のまま(=空振り)。
    window.localStorage.setItem(`collection-ack:${WAFER_KEY}`, "1");

    const fetchMock = jest
      .fn()
      // マウント時の初回評価: 増分なし(1<=1)
      .mockResolvedValueOnce(okJson([progressSeries(1)]))
      // 即時イベントの初回評価: まだ未反映で 1 のまま(空振り)
      .mockResolvedValueOnce(okJson([progressSeries(1)]))
      // バックオフ後の再評価: 2 に反映 → モーダル表示
      .mockResolvedValue(okJson([progressSeries(2)]));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useCollectionProgress());

    // マウント評価を消化
    await act(async () => {
      await flushMicrotasks();
    });
    expect(result.current.celebration).toBeNull();

    // 即時イベント発火(初回は空振り)
    await act(async () => {
      window.dispatchEvent(new Event(COLLECTION_PROGRESS_REFRESH_EVENT));
      await flushMicrotasks();
    });
    expect(result.current.celebration).toBeNull();

    // バックオフ(1500ms)経過 → 再評価でカウント反映 → 表示
    await act(async () => {
      jest.advanceTimersByTime(1500);
      await flushMicrotasks();
    });

    expect(result.current.celebration).not.toBeNull();
    expect(result.current.celebration!.toCount).toBe(2);
  });

  it("1回目の再評価でも未反映なら、2回目(4秒後)の再評価で表示する", async () => {
    window.localStorage.setItem(`collection-ack:${WAFER_KEY}`, "1");

    const fetchMock = jest
      .fn()
      // マウント評価: 増分なし
      .mockResolvedValueOnce(okJson([progressSeries(1)]))
      // 即時イベント初回: 未反映
      .mockResolvedValueOnce(okJson([progressSeries(1)]))
      // 1回目リトライ(1.5s): まだ未反映
      .mockResolvedValueOnce(okJson([progressSeries(1)]))
      // 2回目リトライ(4s): 反映 → 表示
      .mockResolvedValue(okJson([progressSeries(2)]));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useCollectionProgress());
    await act(async () => {
      await flushMicrotasks();
    });

    await act(async () => {
      window.dispatchEvent(new Event(COLLECTION_PROGRESS_REFRESH_EVENT));
      await flushMicrotasks();
    });
    expect(result.current.celebration).toBeNull();

    // 1回目リトライ(1.5s): まだ出ない
    await act(async () => {
      jest.advanceTimersByTime(1500);
      await flushMicrotasks();
    });
    expect(result.current.celebration).toBeNull();

    // 2回目リトライ(4s): 表示
    await act(async () => {
      jest.advanceTimersByTime(4000);
      await flushMicrotasks();
    });
    expect(result.current.celebration).not.toBeNull();
    expect(result.current.celebration!.toCount).toBe(2);
  });

  it("リトライを尽くしても未反映ならモーダルは表示しない", async () => {
    window.localStorage.setItem(`collection-ack:${WAFER_KEY}`, "1");
    // 常に未反映(1のまま)
    const fetchMock = jest.fn().mockResolvedValue(okJson([progressSeries(1)]));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useCollectionProgress());
    await act(async () => {
      await flushMicrotasks();
    });

    await act(async () => {
      window.dispatchEvent(new Event(COLLECTION_PROGRESS_REFRESH_EVENT));
      await flushMicrotasks();
      jest.advanceTimersByTime(1500);
      await flushMicrotasks();
      jest.advanceTimersByTime(4000);
      await flushMicrotasks();
    });

    expect(result.current.celebration).toBeNull();
  });

  it("リトライ待機中にアンマウントされたら以降の再評価(fetch)をしない", async () => {
    window.localStorage.setItem(`collection-ack:${WAFER_KEY}`, "1");
    // 常に未反映 → リトライが続く想定だが、アンマウントで止まること
    const fetchMock = jest.fn().mockResolvedValue(okJson([progressSeries(1)]));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { unmount } = renderHook(() => useCollectionProgress());
    await act(async () => {
      await flushMicrotasks();
    });

    // 即時イベント(初回空振り) → リトライ待機に入る
    await act(async () => {
      window.dispatchEvent(new Event(COLLECTION_PROGRESS_REFRESH_EVENT));
      await flushMicrotasks();
    });
    const callsBeforeUnmount = fetchMock.mock.calls.length;

    // 待機中にアンマウント → タイマーを進めても追加 fetch しない
    unmount();
    await act(async () => {
      jest.advanceTimersByTime(6000);
      await flushMicrotasks();
    });
    expect(fetchMock.mock.calls.length).toBe(callsBeforeUnmount);
  });

  it("リトライ待機中に別経路で表示済みになったら追加の再評価をしない", async () => {
    window.localStorage.setItem(`collection-ack:${WAFER_KEY}`, "0");

    // 初回(マウント)で既に増分あり(1>0) → 表示される。
    const fetchMock = jest.fn().mockResolvedValue(okJson([progressSeries(1)]));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useCollectionProgress());
    await act(async () => {
      await flushMicrotasks();
    });
    expect(result.current.celebration).not.toBeNull();

    const callsAfterMount = fetchMock.mock.calls.length;

    // 表示中に即時イベントが来ても、ガードで弾かれ追加 fetch しない。
    await act(async () => {
      window.dispatchEvent(new Event(COLLECTION_PROGRESS_REFRESH_EVENT));
      await flushMicrotasks();
      jest.advanceTimersByTime(6000);
      await flushMicrotasks();
    });
    expect(fetchMock.mock.calls.length).toBe(callsAfterMount);
  });
});
