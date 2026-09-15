/** @jest-environment jsdom */

import {
  HOME_SORT_TTL_MS,
  clearHomeSortType,
  getHomeSortType,
  isRememberedAcrossVisits,
  setHomeSortType,
} from "@/features/posts/lib/home-sort-preference";

const SESSION_KEY = "persta-ai:home-sort-type";
const VISIT_KEY = "persta-ai:home-sort-type:last-visit";

/** 滞在が切れた状態(タブを閉じて開き直した)を作る。 */
function endSession() {
  window.sessionStorage.clear();
}

describe("home-sort-preference", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    jest.restoreAllMocks();
  });

  test("未保存なら null(既定タブに倒す判断は呼び出し側に委ねる)", () => {
    expect(getHomeSortType()).toBeNull();
  });

  test("保存したタブを返す", () => {
    setHomeSortType("newest");
    expect(getHomeSortType()).toBe("newest");

    setHomeSortType("popular_prompts");
    expect(getHomeSortType()).toBe("popular_prompts");
  });

  test("不正な保存値は null にする(壊れた値でタブを消さない)", () => {
    window.sessionStorage.setItem(SESSION_KEY, "carousel");
    expect(getHomeSortType()).toBeNull();
  });

  test("clearで両方の控えを捨てる", () => {
    setHomeSortType("newest");
    clearHomeSortType();

    expect(getHomeSortType()).toBeNull();
    expect(window.sessionStorage.getItem(SESSION_KEY)).toBeNull();
    expect(window.localStorage.getItem(VISIT_KEY)).toBeNull();
  });

  /*
    ⭐ 控えは2層。滞在(sessionStorage・全タブ)と訪問(localStorage・一覧タブのみ)。
    片方だけ見ていると、下のフォローの扱いも期限の扱いも表現できない。
  */
  describe("2層の控え", () => {
    test("滞在はsessionStorage・訪問はlocalStorageに書く", () => {
      setHomeSortType("newest");

      expect(window.sessionStorage.getItem(SESSION_KEY)).toBe("newest");
      expect(
        JSON.parse(window.localStorage.getItem(VISIT_KEY) as string)
      ).toEqual({ value: "newest", savedAt: expect.any(Number) });
    });

    test("滞在が切れても訪問の控えから復元する(開き直しても前回のタブ)", () => {
      setHomeSortType("newest");
      endSession();

      expect(getHomeSortType()).toBe("newest");
    });

    /*
      ⭐ 同じ滞在のなかでは、いま居るタブへ帰るのが正しい。
      訪問の控え(前回の好み)に上書きされてはいけない。
    */
    test("食い違ったら滞在が優先される", () => {
      setHomeSortType("newest"); // 訪問=newest
      window.sessionStorage.setItem(SESSION_KEY, "following");

      expect(getHomeSortType()).toBe("following");
    });
  });

  /*
    ⭐ フォローは「見る場所」ではなく「行った先」。訪問をまたいで復元すると、
    フォロー0人の人は空の画面でアプリが開き、未ログインの人は開いた瞬間に
    ログインモーダルが出る(控えのほうが認証判定より先に走るため)。
    滞在のなかでは戻れる必要があるので、滞在層にだけ入れる。
  */
  describe("フォロータブ", () => {
    test("訪問をまたいで控えるタブに入らない", () => {
      expect(isRememberedAcrossVisits("following")).toBe(false);
      expect(isRememberedAcrossVisits("newest")).toBe(true);
      expect(isRememberedAcrossVisits("popular_prompts")).toBe(true);
      expect(isRememberedAcrossVisits("week")).toBe(true);
    });

    test("滞在のなかでは戻る(詳細から帰ったらフォローに居る)", () => {
      setHomeSortType("following");
      expect(getHomeSortType()).toBe("following");
    });

    test("滞在が切れたら戻らない(空の画面で開かない)", () => {
      setHomeSortType("following");
      endSession();

      expect(getHomeSortType()).toBeNull();
      expect(window.localStorage.getItem(VISIT_KEY)).toBeNull();
    });

    test("覗いても前の訪問の控えを消さない(読んでいた場所を失わない)", () => {
      setHomeSortType("newest");
      setHomeSortType("following");
      endSession();

      expect(getHomeSortType()).toBe("newest");
    });

    test("古い控えにフォローが残っていても復元しない", () => {
      window.localStorage.setItem(
        VISIT_KEY,
        JSON.stringify({ value: "following", savedAt: Date.now() })
      );

      expect(getHomeSortType()).toBeNull();
    });
  });

  /*
    ⭐ 期限が無いと既定タブ(PICK UP)が死ぬ。新着は「探しに行くとき」に押す
    タブなので、last-write-wins だと一度押しただけの人が永久に新着へ固定される。
  */
  describe("訪問の控えの期限", () => {
    test("24時間ちょうどはまだ有効", () => {
      const savedAt = Date.now();
      setHomeSortType("newest");
      endSession();

      jest.spyOn(Date, "now").mockReturnValue(savedAt + HOME_SORT_TTL_MS);
      expect(getHomeSortType()).toBe("newest");
    });

    test("24時間を超えたら既定タブへ倒す", () => {
      const savedAt = Date.now();
      setHomeSortType("newest");
      endSession();

      jest.spyOn(Date, "now").mockReturnValue(savedAt + HOME_SORT_TTL_MS + 1);
      expect(getHomeSortType()).toBeNull();
    });

    /*
      滞在のなかでは期限に関係なく戻る。滞在層は sessionStorage なので
      そもそも滞在より長く生きない。
    */
    test("期限切れでも滞在のなかでは戻る", () => {
      const savedAt = Date.now();
      setHomeSortType("newest");

      jest.spyOn(Date, "now").mockReturnValue(savedAt + HOME_SORT_TTL_MS + 1);
      expect(getHomeSortType()).toBe("newest");
    });
  });

  describe("訪問の控えが壊れている", () => {
    test.each([
      ["JSONでない", "newest"],
      ["オブジェクトでない", '"newest"'],
      ["valueが不正", JSON.stringify({ value: "carousel", savedAt: 1 })],
      ["savedAtが無い", JSON.stringify({ value: "newest" })],
      ["savedAtが数値でない", JSON.stringify({ value: "newest", savedAt: "1" })],
    ])("%s なら null", (_label, raw) => {
      window.localStorage.setItem(VISIT_KEY, raw);
      expect(getHomeSortType()).toBeNull();
    });
  });

  test("storageが使えなくても例外を投げない", () => {
    const getItem = jest
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("SecurityError");
      });
    const setItem = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    const removeItem = jest
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementation(() => {
        throw new Error("SecurityError");
      });

    expect(() => setHomeSortType("newest")).not.toThrow();
    expect(getHomeSortType()).toBeNull();
    expect(() => clearHomeSortType()).not.toThrow();

    getItem.mockRestore();
    setItem.mockRestore();
    removeItem.mockRestore();
  });

  /*
    ⭐ sessionStorage だけ落ちても訪問の控えは拾えること。
    片方の try の中に両方を入れていると、ここで諦めてしまう。
  */
  test("sessionStorageだけ使えなくても訪問の控えは拾う", () => {
    setHomeSortType("newest");
    endSession();

    // jsdom の Storage は spyOn できないので、入り口ごと差し替える
    const original = window.sessionStorage;
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError");
      },
    });

    try {
      expect(getHomeSortType()).toBe("newest");
    } finally {
      Object.defineProperty(window, "sessionStorage", {
        configurable: true,
        value: original,
      });
    }
  });
});
