/** @jest-environment jsdom */

/**
 * signOut: ブラウザ側のログアウトが失敗・無応答でも、サーバー経由で確実にログアウトする。
 *
 * 2026-09-27 の不具合: ブラウザ側の supabase.auth.signOut() がタブ間ロック待ちの
 * AbortError で失敗し、Supabase にログアウトが届かず、画面も無反応だった
 * (監査ログに logout が1件も無いことで確認)。
 */

jest.mock("@/lib/supabase/client", () => ({
  createClient: jest.fn(),
}));

import { createClient } from "@/lib/supabase/client";
import { getLocaleCookieMaxAge, LOCALE_COOKIE } from "@/i18n/config";
import { signOut } from "@/features/auth/lib/auth-client";

const mockCreateClient = jest.mocked(createClient);

const SERVER_SIGN_OUT_PATH = "/api/auth/signout";
const CLIENT_TIMEOUT_MS = 8000;
const LOCAL_CLEANUP_TIMEOUT_MS = 3000;
const LOCALE_COOKIE_VALUE = `${LOCALE_COOKIE}=ja; path=/; max-age=${getLocaleCookieMaxAge()}; samesite=lax`;
const NETWORK_ERROR_MESSAGE =
  "ネットワークエラーが発生しました。インターネット接続を確認してください。";

const never = () => new Promise(() => {});
const serverOk = () => ({
  ok: true,
  status: 200,
  json: async () => ({ ok: true, revoked: true }),
});
const lockAbort = () =>
  new DOMException("signal is aborted without reason", "AbortError");

/** 成否どちらで終わっても settled を立てる(未処理の reject を出さない) */
function track(promise: Promise<unknown>) {
  const state = { settled: false };
  const mark = () => {
    state.settled = true;
  };
  promise.then(mark, mark);
  return state;
}

describe("signOut のサーバー経由の受け皿", () => {
  const originalFetch = global.fetch;
  let supabaseSignOut: jest.Mock;
  let fetchMock: jest.Mock;
  let cookieSetterSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    document.cookie = `${LOCALE_COOKIE}=ja; path=/`;
    supabaseSignOut = jest.fn();
    mockCreateClient.mockReturnValue({
      auth: { signOut: supabaseSignOut },
    } as never);
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    cookieSetterSpy = jest.spyOn(Document.prototype, "cookie", "set");
  });

  afterEach(() => {
    cookieSetterSpy.mockRestore();
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  test("ブラウザで成功したらサーバーを呼ばない", async () => {
    supabaseSignOut.mockResolvedValue({ error: null });

    await signOut();

    expect(supabaseSignOut).toHaveBeenCalledTimes(1);
    expect(supabaseSignOut).toHaveBeenCalledWith();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cookieSetterSpy).toHaveBeenLastCalledWith(LOCALE_COOKIE_VALUE);
  });

  test("ブラウザが無応答ならサーバー経由で完了", async () => {
    supabaseSignOut
      .mockImplementationOnce(never)
      .mockResolvedValueOnce({ error: null });
    fetchMock.mockResolvedValue(serverOk());

    const pending = signOut();
    const state = track(pending);
    await jest.advanceTimersByTimeAsync(CLIENT_TIMEOUT_MS - 1);
    expect(fetchMock).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      SERVER_SIGN_OUT_PATH,
      expect.objectContaining({ method: "POST", credentials: "same-origin" })
    );
    // Cookie はサーバーが消した。このタブの認証状態も片付けて SIGNED_OUT を流す
    expect(supabaseSignOut).toHaveBeenNthCalledWith(2, { scope: "local" });
    expect(state.settled).toBe(true);
    await expect(pending).resolves.toBeUndefined();
    expect(cookieSetterSpy).toHaveBeenLastCalledWith(LOCALE_COOKIE_VALUE);
  });

  test("ブラウザが失敗してもサーバー経由で完了", async () => {
    supabaseSignOut
      .mockRejectedValueOnce(lockAbort())
      .mockResolvedValueOnce({ error: null });
    fetchMock.mockResolvedValue(serverOk());

    await expect(signOut()).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      SERVER_SIGN_OUT_PATH,
      expect.objectContaining({ method: "POST" })
    );
    expect(supabaseSignOut).toHaveBeenCalledTimes(2);
    expect(supabaseSignOut).toHaveBeenNthCalledWith(2, { scope: "local" });
    expect(cookieSetterSpy).toHaveBeenLastCalledWith(LOCALE_COOKIE_VALUE);
  });

  test("ブラウザがエラーを返してもサーバー経由で完了", async () => {
    supabaseSignOut
      .mockResolvedValueOnce({ error: { message: "network error" } })
      .mockResolvedValueOnce({ error: null });
    fetchMock.mockResolvedValue(serverOk());

    await expect(signOut()).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(supabaseSignOut).toHaveBeenNthCalledWith(2, { scope: "local" });
    expect(cookieSetterSpy).toHaveBeenLastCalledWith(LOCALE_COOKIE_VALUE);
  });

  test("このタブの片付けが止まっても待ち続けない", async () => {
    supabaseSignOut
      .mockResolvedValueOnce({ error: { message: "network error" } })
      .mockImplementationOnce(never);
    fetchMock.mockResolvedValue(serverOk());

    const pending = signOut();
    const state = track(pending);

    await jest.advanceTimersByTimeAsync(LOCAL_CLEANUP_TIMEOUT_MS - 1);
    expect(state.settled).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    expect(state.settled).toBe(true);
    await expect(pending).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      SERVER_SIGN_OUT_PATH,
      expect.objectContaining({ method: "POST" })
    );
    expect(cookieSetterSpy).toHaveBeenLastCalledWith(LOCALE_COOKIE_VALUE);
  });

  test("このタブの片付けが失敗してもログアウトは完了扱い", async () => {
    // サーバーは Cookie を消した。同じロック待ちで片付けだけ失敗しても「失敗」とは言わない
    supabaseSignOut
      .mockRejectedValueOnce(lockAbort())
      .mockRejectedValueOnce(lockAbort());
    fetchMock.mockResolvedValue(serverOk());

    await expect(signOut()).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      SERVER_SIGN_OUT_PATH,
      expect.objectContaining({ method: "POST" })
    );
    expect(supabaseSignOut).toHaveBeenNthCalledWith(2, { scope: "local" });
    expect(cookieSetterSpy).toHaveBeenLastCalledWith(LOCALE_COOKIE_VALUE);
  });

  test("両方失敗なら例外: サーバーに届かない", async () => {
    supabaseSignOut.mockResolvedValue({ error: { message: "network error" } });
    fetchMock.mockRejectedValue(new TypeError("Load failed"));
    cookieSetterSpy.mockClear();

    await expect(signOut()).rejects.toThrow(NETWORK_ERROR_MESSAGE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      SERVER_SIGN_OUT_PATH,
      expect.objectContaining({ method: "POST" })
    );
    // このタブの片付けも言語 Cookie の書き直しもしない
    expect(supabaseSignOut).toHaveBeenCalledTimes(1);
    expect(cookieSetterSpy).not.toHaveBeenCalled();
  });

  test("両方失敗なら例外: サーバーが失敗を返す", async () => {
    supabaseSignOut.mockResolvedValue({ error: { message: "network error" } });
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    cookieSetterSpy.mockClear();

    await expect(signOut()).rejects.toThrow(NETWORK_ERROR_MESSAGE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      SERVER_SIGN_OUT_PATH,
      expect.objectContaining({ method: "POST" })
    );
    expect(supabaseSignOut).toHaveBeenCalledTimes(1);
    expect(cookieSetterSpy).not.toHaveBeenCalled();
  });

  test("両方失敗なら例外: ブラウザがロック待ちで失敗しサーバーにも届かない", async () => {
    supabaseSignOut.mockRejectedValue(lockAbort());
    fetchMock.mockRejectedValue(new TypeError("Load failed"));
    cookieSetterSpy.mockClear();

    // 例外の中身(AbortError)ではなく、通信の問題として伝える
    await expect(signOut()).rejects.toThrow(NETWORK_ERROR_MESSAGE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(supabaseSignOut).toHaveBeenCalledTimes(1);
    expect(cookieSetterSpy).not.toHaveBeenCalled();
  });

  test("両方失敗なら例外: ブラウザが無応答でサーバーにも届かない", async () => {
    supabaseSignOut.mockImplementation(never);
    fetchMock.mockRejectedValue(new TypeError("Load failed"));
    cookieSetterSpy.mockClear();

    const pending = signOut();
    const state = track(pending);
    await jest.advanceTimersByTimeAsync(CLIENT_TIMEOUT_MS - 1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.settled).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    expect(state.settled).toBe(true);
    await expect(pending).rejects.toThrow(NETWORK_ERROR_MESSAGE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(supabaseSignOut).toHaveBeenCalledTimes(1);
    expect(cookieSetterSpy).not.toHaveBeenCalled();
  });

  test("両方失敗なら例外: 返ってきたエラーの文言を訳して伝える", async () => {
    supabaseSignOut.mockResolvedValue({
      error: { message: "Request rate limit reached" },
    });
    fetchMock.mockResolvedValue({ ok: false, status: 503 });

    await expect(signOut()).rejects.toThrow(
      "リクエストが多すぎます。しばらく時間をおいてから再度お試しください。"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("英語設定: サーバー経由で完了したら英語の言語 Cookie を保つ", async () => {
    document.cookie = `${LOCALE_COOKIE}=en; path=/`;
    supabaseSignOut
      .mockRejectedValueOnce(lockAbort())
      .mockResolvedValueOnce({ error: null });
    fetchMock.mockResolvedValue(serverOk());

    await expect(signOut()).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cookieSetterSpy).toHaveBeenLastCalledWith(
      `${LOCALE_COOKIE}=en; path=/; max-age=${getLocaleCookieMaxAge()}; samesite=lax`
    );
  });

  test("英語設定: 両方失敗したら英語で伝える", async () => {
    document.cookie = `${LOCALE_COOKIE}=en; path=/`;
    supabaseSignOut.mockRejectedValue(lockAbort());
    fetchMock.mockRejectedValue(new TypeError("Load failed"));

    await expect(signOut()).rejects.toThrow(
      "A network error occurred. Please check your internet connection."
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
