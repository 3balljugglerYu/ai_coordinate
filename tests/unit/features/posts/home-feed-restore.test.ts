/**
 * 「戻ったとき元の場所に居る」ための保存領域と、スクロール補正のテスト。
 *
 * ここが誤ると (a) 並び替えたのに前の一覧が出る、(b) 復元されず結局上に飛ばされる、
 * (c) スクロール中に画面が勝手に動く、のいずれかが起きる。
 *
 * モジュールスコープに状態を持つため、jest.isolateModules で毎回作り直す。
 */

type Mod = typeof import("@/features/posts/lib/home-feed-restore");

function loadModule(): Mod {
  let mod: Mod;
  jest.isolateModules(() => {
    // isolateModules 内の同期ロードには require が要る
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("@/features/posts/lib/home-feed-restore") as Mod;
  });
  return mod!;
}

/** 21件以上ないと復元対象にならないので、その最小構成を作る。 */
function makePosts(count: number) {
  return Array.from({ length: count }, (_, i) => ({ id: `post-${i}` })) as never;
}

const BASE = {
  posts: makePosts(60),
  offset: 60,
  hasMore: true,
  sortType: "newest" as const,
  viewMode: "feed" as const,
  searchQuery: "",
  anchorPostId: "post-42",
  anchorTop: 120,
  scrollY: 5000,
};

const MATCH = { sortType: "newest" as const, searchQuery: "" };

describe("home-feed-restore の保存", () => {
  test("保存したものを取り出せる(取り出しても消えない)", () => {
    const m = loadModule();
    m.saveHomeFeedRestoreSnapshot(BASE);

    // 開発時は初期化関数が2回走る。1回目で消すと2回目が空になる
    expect(m.peekHomeFeedRestoreSnapshot(MATCH)?.offset).toBe(60);
    expect(m.peekHomeFeedRestoreSnapshot(MATCH)?.offset).toBe(60);
  });

  test("並び替えが違えば復元しない(別の一覧なので)", () => {
    const m = loadModule();
    m.saveHomeFeedRestoreSnapshot(BASE);

    expect(
      m.peekHomeFeedRestoreSnapshot({ sortType: "popular", searchQuery: "" })
    ).toBeNull();
  });

  test("検索語が違えば復元しない", () => {
    const m = loadModule();
    m.saveHomeFeedRestoreSnapshot(BASE);

    expect(
      m.peekHomeFeedRestoreSnapshot({ sortType: "newest", searchQuery: "犬" })
    ).toBeNull();
  });

  test("20件以下は復元しない(サーバー描画で同じ高さになるため意味がない)", () => {
    const m = loadModule();
    m.saveHomeFeedRestoreSnapshot({ ...BASE, posts: makePosts(20), offset: 20 });

    expect(m.peekHomeFeedRestoreSnapshot(MATCH)).toBeNull();
  });

  test("古すぎるものは捨てる(長く空けたら続きより新着)", () => {
    jest.useFakeTimers();
    try {
      const m = loadModule();
      m.saveHomeFeedRestoreSnapshot(BASE);

      jest.advanceTimersByTime(m.HOME_FEED_RESTORE_TTL_MS - 1);
      expect(m.peekHomeFeedRestoreSnapshot(MATCH)).not.toBeNull();

      jest.advanceTimersByTime(2);
      expect(m.peekHomeFeedRestoreSnapshot(MATCH)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  test("clear すると復元しない(並び替え・表示形式の変更時に呼ぶ)", () => {
    const m = loadModule();
    m.saveHomeFeedRestoreSnapshot(BASE);
    m.clearHomeFeedRestoreSnapshot();

    expect(m.peekHomeFeedRestoreSnapshot(MATCH)).toBeNull();
  });
});

describe("restoreHomeFeedScroll", () => {
  let rafCallbacks: FrameRequestCallback[];
  let scrollByMock: jest.Mock;
  let scrollToMock: jest.Mock;

  function runFrames(count: number) {
    for (let i = 0; i < count; i += 1) {
      const next = rafCallbacks.shift();
      if (!next) return;
      next(0);
    }
  }

  /** 指定の位置に anchor カードがある状態を作る。 */
  function mountAnchor(top: number) {
    document.body.innerHTML = `<div data-post-id="post-42"></div>`;
    const el = document.querySelector<HTMLElement>('[data-post-id="post-42"]')!;
    el.getBoundingClientRect = () => ({ top }) as DOMRect;
    return el;
  }

  beforeEach(() => {
    rafCallbacks = [];
    jest
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb: FrameRequestCallback) => {
        rafCallbacks.push(cb);
        return rafCallbacks.length;
      });
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    scrollByMock = jest.fn();
    scrollToMock = jest.fn();
    window.scrollBy = scrollByMock as unknown as typeof window.scrollBy;
    window.scrollTo = scrollToMock as unknown as typeof window.scrollTo;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = "";
  });

  test("anchor の現在位置と保存位置の差だけ寄せる", () => {
    // 保存時は 120px の位置にあった。復元直後は 800px にある
    mountAnchor(800);
    const m = loadModule();

    m.restoreHomeFeedScroll({
      anchorPostId: "post-42",
      anchorTop: 120,
      scrollY: 5000,
    });
    runFrames(1);

    // 800 - 120 = 680 ぶんスクロールすれば、カードが元の高さに戻る
    expect(scrollByMock).toHaveBeenCalledWith({ top: 680 });
    // 絶対位置での復元は使わない(画像やバナーでズレるため)
    expect(scrollToMock).not.toHaveBeenCalled();
  });

  test("画像の読み込みで高さが動いても追従して補正し続ける", () => {
    const el = mountAnchor(800);
    const m = loadModule();

    m.restoreHomeFeedScroll({
      anchorPostId: "post-42",
      anchorTop: 120,
      scrollY: 5000,
    });
    runFrames(1);
    expect(scrollByMock).toHaveBeenLastCalledWith({ top: 680 });

    // 上の画像が読み込まれてカードが押し下げられた
    el.getBoundingClientRect = () => ({ top: 300 }) as DOMRect;
    runFrames(1);
    expect(scrollByMock).toHaveBeenLastCalledWith({ top: 180 });
  });

  test("合っている間は動かさない", () => {
    mountAnchor(120);
    const m = loadModule();

    m.restoreHomeFeedScroll({
      anchorPostId: "post-42",
      anchorTop: 120,
      scrollY: 5000,
    });
    runFrames(10);

    expect(scrollByMock).not.toHaveBeenCalled();
  });

  test("一瞬合っても諦めない(画像は後から読み込まれる)", () => {
    /*
      「数フレーム安定したら終わり」にしていたら、読み込みの谷間で一瞬
      安定したところで打ち切られ、実機で 1,400px ズレたまま終わっていた。
      合っていても見張り続けること。
    */
    const el = mountAnchor(120);
    const m = loadModule();

    m.restoreHomeFeedScroll({
      anchorPostId: "post-42",
      anchorTop: 120,
      scrollY: 5000,
    });
    runFrames(5);
    expect(scrollByMock).not.toHaveBeenCalled();

    // 上の画像が読み込まれてカードが押し下げられた
    el.getBoundingClientRect = () => ({ top: 900 }) as DOMRect;
    runFrames(1);
    expect(scrollByMock).toHaveBeenCalledWith({ top: 780 });
  });

  test("時間の上限で打ち切る(無限に補正し続けない)", () => {
    // fake timers は requestAnimationFrame ごと差し替えてしまい、
    // このテストが用意した rAF キューが使えなくなる。Date.now だけ動かす
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1_000);
    mountAnchor(800);
    const m = loadModule();

    m.restoreHomeFeedScroll({
      anchorPostId: "post-42",
      anchorTop: 120,
      scrollY: 5000,
    });
    runFrames(1);
    expect(rafCallbacks.length).toBe(1);

    nowSpy.mockReturnValue(1_000 + 3_000);
    runFrames(1);
    expect(rafCallbacks.length).toBe(0);
  });

  test("ユーザーが操作を始めたら即座にやめる(指の下で画面を動かさない)", () => {
    mountAnchor(800);
    const m = loadModule();

    m.restoreHomeFeedScroll({
      anchorPostId: "post-42",
      anchorTop: 120,
      scrollY: 5000,
    });

    window.dispatchEvent(new Event("touchstart"));
    runFrames(5);

    expect(scrollByMock).not.toHaveBeenCalled();
  });

  test("anchor が見つからなければ保存した scrollY へ倒す", () => {
    // カードが削除された・まだ描画されていない場合の保険
    document.body.innerHTML = "";
    const m = loadModule();

    m.restoreHomeFeedScroll({
      anchorPostId: "post-42",
      anchorTop: 120,
      scrollY: 5000,
    });
    runFrames(1);

    expect(scrollToMock).toHaveBeenCalledWith({ top: 5000 });
  });
});
