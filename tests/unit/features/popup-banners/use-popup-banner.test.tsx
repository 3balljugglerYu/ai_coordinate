import { act, renderHook, waitFor } from "@testing-library/react";
import {
  getCurrentUser,
  onAuthStateChange,
} from "@/features/auth/lib/auth-client";
import { usePopupBanner } from "@/features/popup-banners/hooks/usePopupBanner";
import { POPUP_BANNER_HISTORY_STORAGE_KEY } from "@/features/popup-banners/lib/popup-banner-display-logic";
import type {
  ActivePopupBanner,
  PopupBannerHistoryMap,
  PopupBannerViewRecord,
} from "@/features/popup-banners/lib/schema";

const POPUP_BANNER_IMPRESSION_SESSION_KEY = "popup-banner-impressions-v1";

jest.mock("@/features/auth/lib/auth-client", () => ({
  getCurrentUser: jest.fn(),
  onAuthStateChange: jest.fn(),
}));

function createBanner(
  id: string,
  displayOrder: number,
  overrides: Partial<ActivePopupBanner> = {}
): ActivePopupBanner {
  return {
    id,
    imageUrl: `https://cdn.example/${id}.webp`,
    linkUrl: `https://example.com/${id}`,
    alt: `banner-${id}`,
    showOnceOnly: false,
    displayOrder,
    ...overrides,
  };
}

function createMockResponse(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response;
}

function createJsonResponse(body: unknown, init?: { status?: number }) {
  return createMockResponse(init?.status ?? 200, body);
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function seedLocalHistory(history: PopupBannerHistoryMap) {
  window.localStorage.setItem(
    POPUP_BANNER_HISTORY_STORAGE_KEY,
    JSON.stringify(history)
  );
}

function readStoredLocalHistory() {
  return JSON.parse(
    window.localStorage.getItem(POPUP_BANNER_HISTORY_STORAGE_KEY) ?? "{}"
  ) as PopupBannerHistoryMap;
}

function readStoredImpressionIds() {
  return JSON.parse(
    window.sessionStorage.getItem(POPUP_BANNER_IMPRESSION_SESSION_KEY) ?? "[]"
  ) as string[];
}

const getCurrentUserMock = getCurrentUser as jest.MockedFunction<
  typeof getCurrentUser
>;
const onAuthStateChangeMock = onAuthStateChange as jest.MockedFunction<
  typeof onAuthStateChange
>;

describe("usePopupBanner", () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.MockedFunction<typeof fetch>;
  let authStateChangeCallback: ((user: { id: string } | null) => void) | null;
  let unsubscribeMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    authStateChangeCallback = null;
    unsubscribeMock = jest.fn();
    fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    Object.defineProperty(global, "fetch", {
      writable: true,
      configurable: true,
      value: fetchMock,
    });
    getCurrentUserMock.mockResolvedValue({ id: "user-1" } as Awaited<
      ReturnType<typeof getCurrentUser>
    >);
    onAuthStateChangeMock.mockImplementation((callback) => {
      authStateChangeCallback = callback as (user: { id: string } | null) => void;
      return {
        unsubscribe: unsubscribeMock,
      } as ReturnType<typeof onAuthStateChange>;
    });
  });

  afterAll(() => {
    Object.defineProperty(global, "fetch", {
      writable: true,
      configurable: true,
      value: originalFetch,
    });
  });

  test("usePopupBanner_viewHistory成功時_remote履歴から現在バナーを選びreadyになる", async () => {
    // Spec: UPB-001
    const records: PopupBannerViewRecord[] = [
      {
        popup_banner_id: "banner-a",
        action_type: "close",
        permanently_dismissed: false,
        reshow_after: "2099-03-30T00:00:00.000Z",
        updated_at: "2099-03-27T00:00:00.000Z",
      },
    ];
    fetchMock.mockResolvedValue(createJsonResponse(records));
    const banners = [createBanner("banner-a", 1), createBanner("banner-b", 2)];

    const { result } = renderHook(() => usePopupBanner(banners));

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(result.current.currentBanner?.id).toBe("banner-b");
    expect(fetchMock).toHaveBeenCalledWith("/api/popup-banners/view-history", {
      cache: "no-store",
    });
  });

  test("usePopupBanner_viewHistory401時_localStorage履歴へフォールバックする", async () => {
    // Spec: UPB-002
    seedLocalHistory({
      "banner-a": {
        actionType: "close",
        permanentlyDismissed: false,
        reshowAfter: "2099-04-10T00:00:00.000Z",
        updatedAt: "2099-03-20T00:00:00.000Z",
      },
    });
    fetchMock.mockResolvedValue(createMockResponse(401, null));
    const banners = [createBanner("banner-a", 1), createBanner("banner-b", 2)];

    const { result } = renderHook(() => usePopupBanner(banners));

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(result.current.currentBanner?.id).toBe("banner-b");
  });

  test("usePopupBanner_viewHistory例外時_localStorage履歴へフォールバックする", async () => {
    // Spec: UPB-002
    seedLocalHistory({
      "banner-a": {
        actionType: "dismiss_forever",
        permanentlyDismissed: true,
        reshowAfter: null,
        updatedAt: "2099-03-20T00:00:00.000Z",
      },
    });
    fetchMock.mockRejectedValue(new Error("network"));
    const banners = [createBanner("banner-a", 1), createBanner("banner-b", 2)];

    const { result } = renderHook(() => usePopupBanner(banners));

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(result.current.currentBanner?.id).toBe("banner-b");
  });

  test("markBannerDisplayed_localMode初回呼び出し時_impressionを保存して送信する", async () => {
    // Spec: UPB-003
    fetchMock
      .mockResolvedValueOnce(createMockResponse(401, null))
      .mockResolvedValue(createJsonResponse({ success: true }));
    const banners = [createBanner("banner-a", 1), createBanner("banner-b", 2)];

    const { result } = renderHook(() => usePopupBanner(banners));

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    act(() => {
      result.current.markBannerDisplayed("banner-a");
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    expect(readStoredImpressionIds()).toEqual(["banner-a"]);
    expect(readStoredLocalHistory()["banner-a"]).toEqual(
      expect.objectContaining({
        actionType: "impression",
        permanentlyDismissed: false,
        reshowAfter: null,
      })
    );

    const [, requestInit] = fetchMock.mock.calls[1] ?? [];
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/popup-banners/interact");
    expect(requestInit).toEqual(
      expect.objectContaining({
        method: "POST",
        keepalive: true,
      })
    );
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      banner_id: "banner-a",
      action_type: "impression",
    });
  });

  test("markBannerDisplayed_remoteMode初回呼び出し時_localStorageへは保存しない", async () => {
    // Spec: UPB-003
    fetchMock
      .mockResolvedValueOnce(createJsonResponse([]))
      .mockResolvedValue(createJsonResponse({ success: true }));
    const banners = [createBanner("banner-a", 1)];

    const { result } = renderHook(() => usePopupBanner(banners));

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    act(() => {
      result.current.markBannerDisplayed("banner-a");
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    expect(window.localStorage.getItem(POPUP_BANNER_HISTORY_STORAGE_KEY)).toBeNull();
    expect(readStoredImpressionIds()).toEqual(["banner-a"]);
  });

  test("markBannerDisplayed_異なるbannerIdや重複呼び出しでは再送しない", async () => {
    // Spec: UPB-004
    fetchMock
      .mockResolvedValueOnce(createJsonResponse([]))
      .mockResolvedValue(createJsonResponse({ success: true }));
    const banners = [createBanner("banner-a", 1)];

    const { result } = renderHook(() => usePopupBanner(banners));

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    act(() => {
      result.current.markBannerDisplayed("other-banner");
      result.current.markBannerDisplayed("banner-a");
      result.current.markBannerDisplayed("banner-a");
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    expect(readStoredImpressionIds()).toEqual(["banner-a"]);
  });

  test("closeBanner_localMode通常close時_closeを保存し次のバナーへ進める", async () => {
    // Spec: UPB-005
    fetchMock
      .mockResolvedValueOnce(createMockResponse(401, null))
      .mockResolvedValue(createJsonResponse({ success: true }));
    const banners = [createBanner("banner-a", 1), createBanner("banner-b", 2)];

    const { result } = renderHook(() => usePopupBanner(banners));

    await waitFor(() => {
      expect(result.current.currentBanner?.id).toBe("banner-a");
    });

    act(() => {
      result.current.closeBanner();
    });

    await waitFor(() => {
      expect(result.current.currentBanner?.id).toBe("banner-b");
    });

    expect(readStoredLocalHistory()["banner-a"]).toEqual(
      expect.objectContaining({
        actionType: "close",
        permanentlyDismissed: false,
      })
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      banner_id: "banner-a",
      action_type: "close",
    });
  });

  test("closeBanner_dismissForever指定時_dismiss_foreverを送信する", async () => {
    // Spec: UPB-006
    fetchMock
      .mockResolvedValueOnce(createMockResponse(401, null))
      .mockResolvedValue(createJsonResponse({ success: true }));
    const banners = [createBanner("banner-a", 1), createBanner("banner-b", 2)];

    const { result } = renderHook(() => usePopupBanner(banners));

    await waitFor(() => {
      expect(result.current.currentBanner?.id).toBe("banner-a");
    });

    act(() => {
      result.current.closeBanner(true);
    });

    await waitFor(() => {
      expect(result.current.currentBanner?.id).toBe("banner-b");
    });

    expect(readStoredLocalHistory()["banner-a"]).toEqual(
      expect.objectContaining({
        actionType: "dismiss_forever",
        permanentlyDismissed: true,
        reshowAfter: null,
      })
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      banner_id: "banner-a",
      action_type: "dismiss_forever",
    });
  });

  test("clickBanner実行時_clickを保存してcurrentBannerをクリアする", async () => {
    // Spec: UPB-007
    fetchMock
      .mockResolvedValueOnce(createMockResponse(401, null))
      .mockResolvedValue(createJsonResponse({ success: true }));
    const banners = [createBanner("banner-a", 1)];

    const { result } = renderHook(() => usePopupBanner(banners));

    await waitFor(() => {
      expect(result.current.currentBanner?.id).toBe("banner-a");
    });

    act(() => {
      result.current.clickBanner();
    });

    await waitFor(() => {
      expect(result.current.currentBanner).toBeNull();
    });

    expect(readStoredLocalHistory()["banner-a"]).toEqual(
      expect.objectContaining({
        actionType: "click",
        permanentlyDismissed: false,
      })
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      banner_id: "banner-a",
      action_type: "click",
    });
  });

  test("usePopupBanner_banners更新後も既存currentBannerが残っていれば保持する", async () => {
    // Spec: UPB-008
    fetchMock
      .mockResolvedValueOnce(createJsonResponse([]))
      .mockResolvedValueOnce(
        createJsonResponse([
          {
            popup_banner_id: "banner-a",
            action_type: "close",
            permanently_dismissed: false,
            reshow_after: "2099-04-10T00:00:00.000Z",
            updated_at: "2099-03-20T00:00:00.000Z",
          },
          {
            popup_banner_id: "banner-b",
            action_type: "close",
            permanently_dismissed: false,
            reshow_after: "2099-04-10T00:00:00.000Z",
            updated_at: "2099-03-20T00:00:00.000Z",
          },
        ] satisfies PopupBannerViewRecord[])
      );

    const initialBanners = [createBanner("banner-a", 1), createBanner("banner-b", 2)];
    const { result, rerender } = renderHook(
      ({ banners }) => usePopupBanner(banners),
      {
        initialProps: {
          banners: initialBanners,
        },
      }
    );

    await waitFor(() => {
      expect(result.current.currentBanner?.id).toBe("banner-a");
    });

    rerender({
      banners: [
        createBanner("banner-a", 1),
        createBanner("banner-b", 2),
        createBanner("banner-c", 3),
      ],
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    expect(result.current.currentBanner?.id).toBe("banner-a");
  });

  test("auth change で未認証から認証済みに変わった場合_remote履歴へ切り替える", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    fetchMock.mockResolvedValue(
      createJsonResponse([
        {
          popup_banner_id: "banner-a",
          action_type: "close",
          permanently_dismissed: false,
          reshow_after: "2099-04-10T00:00:00.000Z",
          updated_at: "2099-03-20T00:00:00.000Z",
        },
      ] satisfies PopupBannerViewRecord[])
    );

    const { result } = renderHook(() =>
      usePopupBanner([createBanner("banner-a", 1), createBanner("banner-b", 2)])
    );

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => {
      authStateChangeCallback?.({ id: "user-1" });
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/popup-banners/view-history", {
        cache: "no-store",
      });
    });
    expect(result.current.currentBanner?.id).toBe("banner-a");
  });

  test("unmount 後に getCurrentUser が解決しても state を更新しない", async () => {
    const deferredUser = createDeferred<Awaited<ReturnType<typeof getCurrentUser>>>();
    getCurrentUserMock.mockReturnValue(deferredUser.promise);

    const { unmount } = renderHook(() => usePopupBanner([createBanner("banner-a", 1)]));

    unmount();

    await act(async () => {
      deferredUser.resolve({ id: "user-1" } as Awaited<ReturnType<typeof getCurrentUser>>);
      await deferredUser.promise;
    });

    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("remote history 読み込み中に unmount された場合は結果を破棄する", async () => {
    const deferredHistory = createDeferred<Response>();
    fetchMock.mockReturnValue(deferredHistory.promise);

    const { unmount } = renderHook(() => usePopupBanner([createBanner("banner-a", 1)]));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    unmount();

    await act(async () => {
      deferredHistory.resolve(createJsonResponse([]));
      await deferredHistory.promise;
    });

    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  test("local mode で banners 更新後も既存 currentBanner を保持する", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const { result, rerender } = renderHook(
      ({ banners }) => usePopupBanner(banners),
      {
        initialProps: {
          banners: [createBanner("banner-a", 1), createBanner("banner-b", 2)],
        },
      }
    );

    await waitFor(() => {
      expect(result.current.currentBanner?.id).toBe("banner-a");
    });

    rerender({
      banners: [createBanner("banner-a", 1), createBanner("banner-c", 2)],
    });

    await waitFor(() => {
      expect(result.current.currentBanner?.id).toBe("banner-a");
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("currentBanner がない状態で close と click を呼んでも何もしない", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const { result } = renderHook(() => usePopupBanner([]));

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    act(() => {
      result.current.closeBanner();
      result.current.clickBanner();
    });

    expect(result.current.currentBanner).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
