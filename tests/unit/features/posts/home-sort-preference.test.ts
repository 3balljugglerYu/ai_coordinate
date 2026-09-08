/** @jest-environment jsdom */

import {
  clearHomeSortType,
  getHomeSortType,
  setHomeSortType,
} from "@/features/posts/lib/home-sort-preference";

const STORAGE_KEY = "persta-ai:home-sort-type";

describe("home-sort-preference", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
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
    window.sessionStorage.setItem(STORAGE_KEY, "carousel");
    expect(getHomeSortType()).toBeNull();
  });

  test("clearで控えを捨てる", () => {
    setHomeSortType("following");
    clearHomeSortType();
    expect(getHomeSortType()).toBeNull();
  });

  /*
    ⭐ localStorage ではなく sessionStorage に持つ。PICK UP は運営が既定として
    前に出したいタブなので、永続化すると一度でも新着を押した人には二度と
    既定が効かなくなる。目的は「同じ滞在のなかで戻ったら元のタブに居ること」。
  */
  test("sessionStorageに保存する(localStorageには残さない)", () => {
    setHomeSortType("newest");

    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe("newest");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
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
});
