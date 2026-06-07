/** @jest-environment jsdom */

import {
  stashPendingWardrobeSave,
  readPendingWardrobeSave,
  clearPendingWardrobeSave,
  claimPendingWardrobeSave,
  PENDING_WARDROBE_SAVE_MAX_IMAGE_BASE64_LENGTH,
} from "@/features/wardrobe/lib/pending-wardrobe-save";

const KEY = "persta-ai:wardrobe-pending";
const IMG = "data:image/png;base64,AAAA";

beforeEach(() => {
  window.localStorage.clear();
  global.fetch = jest.fn();
});

describe("退避 (stash/read/clear)", () => {
  test("stash → read で往復する", () => {
    expect(stashPendingWardrobeSave({ imageBase64: IMG, styleId: "s1" })).toBe(
      true,
    );
    expect(readPendingWardrobeSave()).toEqual({ imageBase64: IMG, styleId: "s1" });
  });

  test("未保存なら null", () => {
    expect(readPendingWardrobeSave()).toBeNull();
  });

  test("壊れた JSON は null", () => {
    window.localStorage.setItem(KEY, "{ not json");
    expect(readPendingWardrobeSave()).toBeNull();
  });

  test("imageBase64 欠落は null", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ styleId: "s1" }));
    expect(readPendingWardrobeSave()).toBeNull();
  });

  test("styleId が無くても imageBase64 があれば styleId=null で読める", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ imageBase64: IMG }));
    expect(readPendingWardrobeSave()).toEqual({ imageBase64: IMG, styleId: null });
  });

  test("clear 後は null", () => {
    stashPendingWardrobeSave({ imageBase64: IMG, styleId: null });
    clearPendingWardrobeSave();
    expect(readPendingWardrobeSave()).toBeNull();
  });

  test("上限を超える imageBase64 は保存しない", () => {
    const tooLargeImage = "x".repeat(
      PENDING_WARDROBE_SAVE_MAX_IMAGE_BASE64_LENGTH + 1,
    );
    expect(
      stashPendingWardrobeSave({ imageBase64: tooLargeImage, styleId: null }),
    ).toBe(false);
    expect(readPendingWardrobeSave()).toBeNull();
  });

  test("localStorage 書き込み失敗時は false を返す", () => {
    const spy = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      });

    expect(stashPendingWardrobeSave({ imageBase64: IMG, styleId: null })).toBe(
      false,
    );
    spy.mockRestore();
  });
});

describe("claimPendingWardrobeSave", () => {
  test("pending 無し: none を返し fetch しない", async () => {
    const result = await claimPendingWardrobeSave();
    expect(result).toEqual({ status: "none" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("成功: POST /api/wardrobe/claim → saved、localStorage はクリア", async () => {
    stashPendingWardrobeSave({ imageBase64: IMG, styleId: "s1" });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, id: "img-7" }),
    });

    const result = await claimPendingWardrobeSave();

    expect(result).toEqual({ status: "saved", id: "img-7" });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/wardrobe/claim",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body as string,
    );
    expect(body).toEqual({ imageBase64: IMG, styleId: "s1" });
    expect(readPendingWardrobeSave()).toBeNull(); // 一回限り
  });

  test("上限 429: error(errorCode) を返しクリア", async () => {
    stashPendingWardrobeSave({ imageBase64: IMG, styleId: null });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({ errorCode: "WARDROBE_CLAIM_DAILY_CAP_EXCEEDED" }),
    });

    const result = await claimPendingWardrobeSave();

    expect(result).toEqual({
      status: "error",
      errorCode: "WARDROBE_CLAIM_DAILY_CAP_EXCEEDED",
    });
    expect(readPendingWardrobeSave()).toBeNull();
  });

  test("通信失敗: error(null) を返しクリア(再マウントのループ防止)", async () => {
    stashPendingWardrobeSave({ imageBase64: IMG, styleId: null });
    (global.fetch as jest.Mock).mockRejectedValue(new Error("network"));

    const result = await claimPendingWardrobeSave();

    expect(result).toEqual({ status: "error", errorCode: null });
    expect(readPendingWardrobeSave()).toBeNull();
  });

  test("data.ok が無くても id があれば saved (id のみで判定)", async () => {
    stashPendingWardrobeSave({ imageBase64: IMG, styleId: null });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ id: "img-9" }),
    });
    expect(await claimPendingWardrobeSave()).toEqual({
      status: "saved",
      id: "img-9",
    });
  });

  test("res.ok でも id 欠落なら error(null)", async () => {
    stashPendingWardrobeSave({ imageBase64: IMG, styleId: null });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    expect(await claimPendingWardrobeSave()).toEqual({
      status: "error",
      errorCode: null,
    });
  });

  test("HTTP エラーで errorCode 欠落なら error(null)", async () => {
    stashPendingWardrobeSave({ imageBase64: IMG, styleId: null });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });
    expect(await claimPendingWardrobeSave()).toEqual({
      status: "error",
      errorCode: null,
    });
  });
});
