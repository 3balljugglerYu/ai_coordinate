/** @jest-environment jsdom */

/**
 * 画像分割ツールの GA4 イベント。
 *
 * このツールは全部ブラウザ内で完結するので、**GA4 に送らなかったことは
 * どこにも残らない**。落ちても気づけないため、送る内容をここで固定する。
 *
 * ⭐ とくに「画像はサーバーにアップロードされません」と書いているページなので、
 * ファイル名などユーザー由来の値を混ぜていないことを守る。
 */

import {
  trackImageSplitFailed,
  trackImageSplitRun,
  trackImageSplitSaveAll,
  trackImageSplitSavePiece,
} from "@/features/tools/lib/image-split-events";

const gtag = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (window as unknown as { gtag?: unknown }).gtag = gtag;
});

afterEach(() => {
  delete (window as unknown as { gtag?: unknown }).gtag;
});

describe("画像分割ツールのイベント", () => {
  test("分割の成功は分割方法と枚数を送る", () => {
    trackImageSplitRun("vertical3", 3);

    expect(gtag).toHaveBeenCalledWith("event", "image_split_run", {
      split_mode: "vertical3",
      piece_count: 3,
    });
  });

  test("1枚保存は手段(共有/ダウンロード)を送る", () => {
    trackImageSplitSavePiece("share");
    trackImageSplitSavePiece("download");

    expect(gtag).toHaveBeenNthCalledWith(1, "event", "image_split_save_piece", {
      save_method: "share",
    });
    expect(gtag).toHaveBeenNthCalledWith(2, "event", "image_split_save_piece", {
      save_method: "download",
    });
  });

  test("まとめて保存は手段と枚数を送る", () => {
    trackImageSplitSaveAll("download", 4);

    expect(gtag).toHaveBeenCalledWith("event", "image_split_save_all", {
      save_method: "download",
      piece_count: 4,
    });
  });

  test("失敗はこちらで決めた理由の定数だけを送る", () => {
    trackImageSplitFailed("decode_failed");

    expect(gtag).toHaveBeenCalledWith("event", "image_split_failed", {
      reason: "decode_failed",
    });
  });

  test("⭐送るパラメータにユーザー由来の値を混ぜない", () => {
    trackImageSplitRun("grid4", 4);
    trackImageSplitSaveAll("share", 4);
    trackImageSplitSavePiece("share");
    trackImageSplitFailed("not_an_image");

    const allowedKeys = new Set([
      "split_mode",
      "piece_count",
      "save_method",
      "reason",
    ]);
    for (const call of gtag.mock.calls) {
      const params = call[2] as Record<string, unknown>;
      for (const key of Object.keys(params)) {
        expect(allowedKeys.has(key)).toBe(true);
      }
      // 値も定数か数値のみ(ファイル名・URL のような文字列を通さない)
      for (const value of Object.values(params)) {
        expect(["string", "number"]).toContain(typeof value);
        if (typeof value === "string") {
          expect(value).toMatch(/^[a-z0-9_]+$/);
        }
      }
    }
  });

  test("⭐gtag が無い環境(未設定・広告ブロック)でも例外にしない", () => {
    delete (window as unknown as { gtag?: unknown }).gtag;

    expect(() => trackImageSplitRun("vertical4", 4)).not.toThrow();
    expect(() => trackImageSplitSaveAll("download", 4)).not.toThrow();
  });

  test("⭐gtag が投げても呼び出し元に伝播させない(計測で操作を止めない)", () => {
    gtag.mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => trackImageSplitRun("vertical4", 4)).not.toThrow();
  });
});
