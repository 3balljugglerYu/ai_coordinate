import {
  consumePendingHomePostRefresh,
  persistPendingHomePostRefresh,
} from "@/features/posts/lib/home-post-refresh";

const STORAGE_KEY = "persta:home-post-refresh";

describe("home-post-refresh", () => {
  const originalSessionStorage = window.sessionStorage;

  afterEach(() => {
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: originalSessionStorage,
    });
    window.sessionStorage.clear();
    jest.restoreAllMocks();
  });

  test("persistPendingHomePostRefresh_postedを保存しconsumePendingHomePostRefreshで一度だけ消費する", () => {
    persistPendingHomePostRefresh({
      action: "posted",
      postId: "post-1",
      bonusGranted: 50,
    });

    expect(consumePendingHomePostRefresh()).toEqual({
      action: "posted",
      postId: "post-1",
      bonusGranted: 50,
    });
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(consumePendingHomePostRefresh()).toBeNull();
  });

  test("persistPendingHomePostRefresh_unpostedを保存しconsumePendingHomePostRefreshで消費する", () => {
    persistPendingHomePostRefresh({
      action: "unposted",
      postId: "post-2",
    });

    expect(consumePendingHomePostRefresh()).toEqual({
      action: "unposted",
      postId: "post-2",
    });
  });

  test("consumePendingHomePostRefresh_sessionStorage例外時はnullを返す", () => {
    const getItem = jest
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new DOMException("blocked", "SecurityError");
      });
    const removeItem = jest
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementation(() => {
        throw new DOMException("blocked", "SecurityError");
      });

    expect(consumePendingHomePostRefresh()).toBeNull();
    expect(getItem).toHaveBeenCalledWith(STORAGE_KEY);
    expect(removeItem).toHaveBeenCalledWith(STORAGE_KEY);
  });
});
