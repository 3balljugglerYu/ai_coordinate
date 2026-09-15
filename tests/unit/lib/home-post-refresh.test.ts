import {
  consumePendingHomePostRefresh,
  HOME_POST_REFRESH_EVENT,
  notifyPendingHomePostRefresh,
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
      // 生成方法を持たない保存は「不明」として null になる
      generationType: null,
      // 一覧へ差し込むカード。持たない保存は差し込まない
      post: null,
    });
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(consumePendingHomePostRefresh()).toBeNull();
  });

  /*
    ⭐ 一覧へ差し込むカードを、そのまま往復させること。

    投稿APIが一覧と同じ形で返したものを運ぶだけで、ここで組み立て直したり
    列を検査したりしない(検査すると `Post` の形が変わるたびに落ちる)。
  */
  test("⭐差し込み用のカードをそのまま往復させる", () => {
    const card = {
      id: "post-1",
      caption: "投稿したて",
      user: { id: "user-1", nickname: "みきふく" },
      like_count: 0,
    };

    persistPendingHomePostRefresh({
      action: "posted",
      postId: "post-1",
      post: card as never,
    });

    expect(consumePendingHomePostRefresh()).toMatchObject({ post: card });
  });

  test("カードがオブジェクトでなければ落とす(差し込みを諦める)", () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ action: "posted", postId: "post-1", post: "post-1" })
    );

    expect(consumePendingHomePostRefresh()).toMatchObject({ post: null });
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

  test("notifyPendingHomePostRefresh_ホーム更新イベントを通知する", () => {
    const listener = jest.fn();
    window.addEventListener(HOME_POST_REFRESH_EVENT, listener);

    try {
      notifyPendingHomePostRefresh();
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(HOME_POST_REFRESH_EVENT, listener);
    }
  });

  test("generationType は保存→消費で保たれる", () => {
    /*
      consume は sessionStorage の値を項目ごとに組み直す。ここで落とすと
      付与モーダルの還元案内が**永久に出ない**（この施策の目的そのものが
      機能しなくなる）。PostList のテストは consume をモックするため、
      この経路は実物で固定しておく必要がある。
    */
    persistPendingHomePostRefresh({
      action: "posted",
      postId: "post-1",
      bonusGranted: 20,
      generationType: "free",
    });

    const consumed = consumePendingHomePostRefresh();

    expect(consumed).toMatchObject({
      action: "posted",
      postId: "post-1",
      bonusGranted: 20,
      generationType: "free",
    });
  });

  test("generationType が壊れていても落ちない", () => {
    window.sessionStorage.setItem(
      "persta:home-post-refresh",
      JSON.stringify({ action: "posted", postId: "post-1", generationType: 42 })
    );

    expect(consumePendingHomePostRefresh()).toMatchObject({
      action: "posted",
      postId: "post-1",
      generationType: null,
    });
  });
});
