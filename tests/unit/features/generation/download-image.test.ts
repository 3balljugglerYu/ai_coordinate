/**
 * `shareOrDownloadGeneratedImage` の単体テスト。
 *
 * 投稿詳細・スタイル画面・生成結果系の3系統で共通利用するため、各分岐
 * （PC ダウンロード／モバイル Web Share／モバイル fallback／キャンセル／
 * 認証エラー／その他失敗）を独立に検証する。
 */

import { shareOrDownloadGeneratedImage } from "@/features/generation/lib/download-image";

const DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)";

const messages = {
  accessDenied: "denied",
  fetchFailed: (statusText: string) => `failed:${statusText}`,
};

const target = { id: "asset-1", url: "https://cdn.example.com/x.png" };

function setNavigator(opts: {
  userAgent: string;
  canShare?: ((data: ShareData) => boolean) | undefined;
  share?: ((data: ShareData) => Promise<void>) | undefined;
}) {
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value: opts.userAgent,
  });
  Object.defineProperty(window.navigator, "canShare", {
    configurable: true,
    value: opts.canShare,
  });
  Object.defineProperty(window.navigator, "share", {
    configurable: true,
    value: opts.share,
  });
}

function makeOkResponse(): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    blob: jest.fn().mockResolvedValue(new Blob(["x"], { type: "image/png" })),
    headers: { get: () => "image/png" } as unknown as Headers,
  } as unknown as Response;
}

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue(makeOkResponse());
  // jsdom は createObjectURL / revokeObjectURL を実装していないので最低限の polyfill
  if (typeof URL.createObjectURL !== "function") {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: jest.fn(() => "blob:mock"),
    });
  } else {
    jest.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
  }
  if (typeof URL.revokeObjectURL !== "function") {
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: jest.fn(),
    });
  } else {
    jest.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);
  }
});

afterEach(() => {
  jest.restoreAllMocks();
  setNavigator({ userAgent: DESKTOP_UA, canShare: undefined, share: undefined });
});

describe("shareOrDownloadGeneratedImage", () => {
  test("PC では Web Share に触らず onDownloadSuccess のみ発火する", async () => {
    setNavigator({ userAgent: DESKTOP_UA });
    const onDownloadSuccess = jest.fn();
    const onShareSuccess = jest.fn();

    await shareOrDownloadGeneratedImage(target, messages, {
      onShareSuccess,
      onDownloadSuccess,
    });

    expect(onDownloadSuccess).toHaveBeenCalledTimes(1);
    expect(onShareSuccess).not.toHaveBeenCalled();
  });

  test("モバイル & canShare 可能なら share を呼び onShareSuccess のみ発火する", async () => {
    const share = jest.fn().mockResolvedValue(undefined);
    const canShare = jest.fn().mockReturnValue(true);
    setNavigator({ userAgent: MOBILE_UA, canShare, share });

    const onDownloadSuccess = jest.fn();
    const onShareSuccess = jest.fn();

    await shareOrDownloadGeneratedImage(target, messages, {
      onShareSuccess,
      onDownloadSuccess,
    });

    expect(canShare).toHaveBeenCalledWith({ files: expect.any(Array) });
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Persta.AI" }),
    );
    expect(onShareSuccess).toHaveBeenCalledTimes(1);
    expect(onDownloadSuccess).not.toHaveBeenCalled();
  });

  test("モバイルだが canShare が false のときはブラウザDLにフォールバックする", async () => {
    const share = jest.fn();
    const canShare = jest.fn().mockReturnValue(false);
    setNavigator({ userAgent: MOBILE_UA, canShare, share });

    const onDownloadSuccess = jest.fn();
    const onShareSuccess = jest.fn();

    await shareOrDownloadGeneratedImage(target, messages, {
      onShareSuccess,
      onDownloadSuccess,
    });

    expect(share).not.toHaveBeenCalled();
    expect(onShareSuccess).not.toHaveBeenCalled();
    expect(onDownloadSuccess).toHaveBeenCalledTimes(1);
  });

  test("Web Share が AbortError でキャンセルされたときは callback を呼ばず例外も投げない", async () => {
    const abort = new DOMException("canceled", "AbortError");
    const share = jest.fn().mockRejectedValue(abort);
    const canShare = jest.fn().mockReturnValue(true);
    setNavigator({ userAgent: MOBILE_UA, canShare, share });

    const onDownloadSuccess = jest.fn();
    const onShareSuccess = jest.fn();

    await expect(
      shareOrDownloadGeneratedImage(target, messages, {
        onShareSuccess,
        onDownloadSuccess,
      }),
    ).resolves.toBeUndefined();

    expect(onShareSuccess).not.toHaveBeenCalled();
    expect(onDownloadSuccess).not.toHaveBeenCalled();
  });

  test("Web Share が予期しないエラーのときはダウンロードへフォールバックする", async () => {
    const share = jest.fn().mockRejectedValue(new Error("network"));
    const canShare = jest.fn().mockReturnValue(true);
    setNavigator({ userAgent: MOBILE_UA, canShare, share });

    const onDownloadSuccess = jest.fn();
    const onShareSuccess = jest.fn();

    await shareOrDownloadGeneratedImage(target, messages, {
      onShareSuccess,
      onDownloadSuccess,
    });

    expect(onShareSuccess).not.toHaveBeenCalled();
    expect(onDownloadSuccess).toHaveBeenCalledTimes(1);
  });

  test("401 のときは accessDenied メッセージで例外を投げる", async () => {
    setNavigator({ userAgent: DESKTOP_UA });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      blob: jest.fn(),
      headers: { get: () => null } as unknown as Headers,
    } as unknown as Response);

    await expect(
      shareOrDownloadGeneratedImage(target, messages),
    ).rejects.toThrow("denied");
  });

  test("その他の失敗は fetchFailed(statusText) で例外を投げる", async () => {
    setNavigator({ userAgent: DESKTOP_UA });
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Server Error",
      blob: jest.fn(),
      headers: { get: () => null } as unknown as Headers,
    } as unknown as Response);

    await expect(
      shareOrDownloadGeneratedImage(target, messages),
    ).rejects.toThrow("failed:Server Error");
  });
});
