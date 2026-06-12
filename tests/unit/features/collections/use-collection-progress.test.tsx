import { renderHook, waitFor } from "@testing-library/react";
import { useCollectionProgress } from "@/features/collections/hooks/useCollectionProgress";
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

  it("プレビューは ack を変更しない(実進捗を汚さない)", async () => {
    window.localStorage.setItem(`collection-ack:${WAFER_KEY}`, "2");
    mockProgressResponse({ items: [makeSeries()], isAdminViewer: true });
    setUrl(`/ja?collection_reset=${WAFER_KEY}&collection_to=4`);

    const { result } = renderHook(() => useCollectionProgress());

    await waitFor(() => expect(result.current.celebration).not.toBeNull());
    expect(window.localStorage.getItem(`collection-ack:${WAFER_KEY}`)).toBe("2");
  });
});
