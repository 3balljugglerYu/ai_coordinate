/** @jest-environment jsdom */

import {
  clearActiveStyleJob,
  persistActiveStyleJob,
  readActiveStyleJob,
} from "@/features/style/lib/active-async-job-storage";

describe("active-async-job-storage", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  test("persist → read で往復できる", () => {
    persistActiveStyleJob({ jobId: "job-1", styleId: "style-1" });
    expect(readActiveStyleJob()).toEqual({ jobId: "job-1", styleId: "style-1" });
  });

  test("未保存なら null", () => {
    expect(readActiveStyleJob()).toBeNull();
  });

  test("clear で消える", () => {
    persistActiveStyleJob({ jobId: "job-1", styleId: "style-1" });
    clearActiveStyleJob();
    expect(readActiveStyleJob()).toBeNull();
  });

  test("jobId 空文字は保存しない", () => {
    persistActiveStyleJob({ jobId: "", styleId: "style-1" });
    expect(readActiveStyleJob()).toBeNull();
  });

  test("壊れた JSON は null(例外を投げない)", () => {
    window.sessionStorage.setItem("persta:style:active-async-job", "{not json");
    expect(readActiveStyleJob()).toBeNull();
  });

  test("styleId 欠落でも jobId があれば復元(styleId は空文字)", () => {
    window.sessionStorage.setItem(
      "persta:style:active-async-job",
      JSON.stringify({ jobId: "job-9" }),
    );
    expect(readActiveStyleJob()).toEqual({ jobId: "job-9", styleId: "" });
  });

  test("storage の各操作が throw しても安全に処理する(quota/アクセス拒否等)", () => {
    const original = window.sessionStorage;
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error("access denied");
        },
        setItem: () => {
          throw new Error("quota exceeded");
        },
        removeItem: () => {
          throw new Error("blocked");
        },
        clear: () => {},
      },
    });
    try {
      expect(() =>
        persistActiveStyleJob({ jobId: "job-1", styleId: "style-1" }),
      ).not.toThrow();
      expect(readActiveStyleJob()).toBeNull();
      expect(() => clearActiveStyleJob()).not.toThrow();
    } finally {
      Object.defineProperty(window, "sessionStorage", {
        configurable: true,
        value: original,
      });
    }
  });
});
