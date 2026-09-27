/** @jest-environment jsdom */

/**
 * useAuthUser: ヘッダー・サイドバーが表示に使うログイン状態。
 *
 * 確認に失敗したとき(resolveCurrentUser が unknown)に「未ログイン」へ倒すと、
 * ログイン中なのに「ログイン」ボタンが出たまま戻らない(2026-09-27 の不具合)。
 *
 * 約束事:
 *  - 初期状態はサーバーへの確認(resolveCurrentUser)で決める。失敗の間は loading のまま
 *    取り直す(2秒から倍々、上限60秒)
 *  - 初回通知(INITIAL_SESSION)は使わない。手元の Cookie を読んだだけで、null は
 *    「セッションが無い」と「読めなかった」を区別できない
 *  - それ以外の通知(ログイン・ログアウト・トークン更新)は常に優先する。通知より前に
 *    始めた確認の結果は、後から返っても上書きしない。取り直し待ちもやめる
 */

jest.mock("@/features/auth/lib/auth-client", () => ({
  resolveCurrentUser: jest.fn(),
  onAuthStateChange: jest.fn(),
}));

import { act, renderHook } from "@testing-library/react";
import type { AuthChangeEvent, User } from "@supabase/supabase-js";
import {
  onAuthStateChange,
  resolveCurrentUser,
  type CurrentUserResult,
} from "@/features/auth/lib/auth-client";
import { useAuthUser } from "@/features/auth/hooks/use-auth-user";

const mockResolve = jest.mocked(resolveCurrentUser);
const mockOnAuthStateChange = jest.mocked(onAuthStateChange);

const USER = { id: "11111111-1111-4111-8111-111111111111" } as User;
const LOADING = { status: "loading", user: null };
const SIGNED_OUT = { status: "signed-out", user: null };
const SIGNED_IN = { status: "signed-in", user: USER };

type Listener = (user: User | null, event: AuthChangeEvent) => void;

let listener: Listener | null = null;
const unsubscribe = jest.fn();
let visibility: DocumentVisibilityState = "visible";

async function emit(user: User | null, event: AuthChangeEvent) {
  // フックが認証状態の通知を購読していること
  expect(listener).toEqual(expect.any(Function));
  await act(async () => {
    listener!(user, event);
  });
}

async function flush(ms = 0) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

function setVisibility(next: DocumentVisibilityState) {
  act(() => {
    visibility = next;
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
  });
}

/** 返すタイミングをテスト側で決められる確認結果 */
function deferredResult() {
  let resolve: (value: CurrentUserResult) => void = () => {};
  const promise = new Promise<CurrentUserResult>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("useAuthUser", () => {
  beforeAll(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => visibility === "hidden",
    });
  });

  afterAll(() => {
    delete (document as { visibilityState?: unknown }).visibilityState;
    delete (document as { hidden?: unknown }).hidden;
  });

  beforeEach(() => {
    jest.useFakeTimers();
    mockResolve.mockReset();
    mockOnAuthStateChange.mockReset();
    unsubscribe.mockReset();
    visibility = "visible";
    listener = null;
    mockOnAuthStateChange.mockImplementation((callback) => {
      listener = callback as Listener;
      return { unsubscribe } as never;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("useAuthUser は確認成功で signed-in", async () => {
    mockResolve.mockResolvedValue({ status: "signed-in", user: USER });

    const { result } = renderHook(() => useAuthUser());
    expect(result.current).toEqual(LOADING);

    await flush();
    expect(result.current).toEqual(SIGNED_IN);

    // 決まったあとは問い合わせない
    await flush(120_000);
    expect(mockResolve).toHaveBeenCalledTimes(1);
  });

  test("未ログインが確定したら signed-out", async () => {
    mockResolve.mockResolvedValue({ status: "signed-out" });

    const { result } = renderHook(() => useAuthUser());
    await flush();
    expect(result.current).toEqual(SIGNED_OUT);

    await flush(120_000);
    expect(mockResolve).toHaveBeenCalledTimes(1);
  });

  test("初回通知は無視し、以後の通知は反映する", async () => {
    mockResolve.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useAuthUser());
    await flush();

    await emit(null, "INITIAL_SESSION");
    expect(result.current).toEqual(LOADING);
    await emit(USER, "INITIAL_SESSION");
    expect(result.current).toEqual(LOADING);

    await emit(USER, "SIGNED_IN");
    expect(result.current).toEqual(SIGNED_IN);

    await emit(null, "SIGNED_OUT");
    expect(result.current).toEqual(SIGNED_OUT);
  });

  test("ログイン中に届いた初回通知の null は無視する", async () => {
    mockResolve.mockResolvedValue({ status: "signed-in", user: USER });

    const { result } = renderHook(() => useAuthUser());
    await flush();
    await emit(null, "INITIAL_SESSION");

    expect(result.current).toEqual(SIGNED_IN);
  });

  test("通知より前に始めた確認の結果では上書きしない: ログイン通知のあとの失敗", async () => {
    const pending = deferredResult();
    mockResolve.mockReturnValueOnce(pending.promise);

    const { result } = renderHook(() => useAuthUser());
    await flush();
    await emit(USER, "SIGNED_IN");
    expect(result.current).toEqual(SIGNED_IN);

    await act(async () => {
      pending.resolve({ status: "unknown" });
    });
    await flush(120_000);

    expect(result.current).toEqual(SIGNED_IN);
    // 通知で決まったので取り直さない
    expect(mockResolve).toHaveBeenCalledTimes(1);
  });

  test("通知より前に始めた確認の結果では上書きしない: ログアウト通知のあとの古いログイン", async () => {
    const pending = deferredResult();
    mockResolve.mockReturnValueOnce(pending.promise);

    const { result } = renderHook(() => useAuthUser());
    await flush();
    await emit(null, "SIGNED_OUT");
    expect(result.current).toEqual(SIGNED_OUT);

    await act(async () => {
      pending.resolve({ status: "signed-in", user: USER });
    });
    await flush();

    expect(result.current).toEqual(SIGNED_OUT);
  });

  test("確認失敗は loading のまま取り直す", async () => {
    mockResolve.mockResolvedValue({ status: "unknown" });

    const { result } = renderHook(() => useAuthUser());
    await flush();
    expect(result.current).toEqual(LOADING);
    expect(mockResolve).toHaveBeenCalledTimes(1);

    // 2秒から倍々で延ばし、60秒で止める
    const expectedDelays = [2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000];
    for (const [index, delay] of expectedDelays.entries()) {
      await flush(delay - 1);
      expect(mockResolve).toHaveBeenCalledTimes(index + 1);
      await flush(1);
      expect(mockResolve).toHaveBeenCalledTimes(index + 2);
      // 失敗の間は「未ログイン」に倒さない
      expect(result.current).toEqual(LOADING);
    }

    mockResolve.mockResolvedValue({ status: "signed-in", user: USER });
    await flush(60_000);
    expect(result.current).toEqual(SIGNED_IN);
  });

  test("取り直し待ちの間に通知で決まったら取り直しをやめる", async () => {
    mockResolve.mockResolvedValue({ status: "unknown" });

    const { result } = renderHook(() => useAuthUser());
    await flush();
    await emit(USER, "TOKEN_REFRESHED");
    expect(result.current).toEqual(SIGNED_IN);

    await flush(120_000);
    expect(mockResolve).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual(SIGNED_IN);
  });

  test("表に戻ったら取り直しを前倒しする", async () => {
    mockResolve
      .mockResolvedValueOnce({ status: "unknown" })
      .mockResolvedValueOnce({ status: "signed-in", user: USER });

    const { result } = renderHook(() => useAuthUser());
    await flush();
    expect(mockResolve).toHaveBeenCalledTimes(1);

    // 裏に回っただけでは取り直さない
    setVisibility("hidden");
    await flush();
    expect(mockResolve).toHaveBeenCalledTimes(1);

    setVisibility("visible");
    await flush();

    // 2秒待たずに取り直している
    expect(mockResolve).toHaveBeenCalledTimes(2);
    expect(result.current).toEqual(SIGNED_IN);

    // 元の取り直しの予約は残っていない
    await flush(120_000);
    expect(mockResolve).toHaveBeenCalledTimes(2);
  });

  test("状態が決まっていれば表に戻っても確かめ直さない", async () => {
    mockResolve.mockResolvedValue({ status: "signed-in", user: USER });

    renderHook(() => useAuthUser());
    await flush();

    setVisibility("hidden");
    setVisibility("visible");
    await flush();

    expect(mockResolve).toHaveBeenCalledTimes(1);
  });

  test("確認の途中に届いた初回通知では確認を止めない", async () => {
    const pending = deferredResult();
    mockResolve.mockReturnValueOnce(pending.promise);

    const { result } = renderHook(() => useAuthUser());
    await flush();
    await emit(null, "INITIAL_SESSION");

    await act(async () => {
      pending.resolve({ status: "signed-in", user: USER });
    });
    await flush();

    expect(result.current).toEqual(SIGNED_IN);
  });

  test("取り直し待ちの間に届いた初回通知では取り直しをやめない", async () => {
    mockResolve
      .mockResolvedValueOnce({ status: "unknown" })
      .mockResolvedValueOnce({ status: "signed-in", user: USER });

    const { result } = renderHook(() => useAuthUser());
    await flush();
    await emit(null, "INITIAL_SESSION");
    await emit(USER, "INITIAL_SESSION");

    await flush(2000);

    expect(mockResolve).toHaveBeenCalledTimes(2);
    expect(result.current).toEqual(SIGNED_IN);
  });

  test("最初の確認がまだ返っていなければ表に戻っても重ねて確認しない", async () => {
    mockResolve.mockReturnValue(new Promise(() => {}));

    renderHook(() => useAuthUser());
    await flush();

    setVisibility("hidden");
    setVisibility("visible");
    await flush();

    expect(mockResolve).toHaveBeenCalledTimes(1);
  });

  test("通知より前に始めた確認の結果では上書きしない: ログイン通知のあとの古い未ログイン", async () => {
    const pending = deferredResult();
    mockResolve.mockReturnValueOnce(pending.promise);

    const { result } = renderHook(() => useAuthUser());
    await flush();
    await emit(USER, "SIGNED_IN");

    await act(async () => {
      pending.resolve({ status: "signed-out" });
    });
    await flush();

    expect(result.current).toEqual(SIGNED_IN);
  });

  test("通知より前に始めた取り直しの結果でも上書きしない", async () => {
    const retry = deferredResult();
    mockResolve
      .mockResolvedValueOnce({ status: "unknown" })
      .mockReturnValueOnce(retry.promise);

    const { result } = renderHook(() => useAuthUser());
    await flush();
    // 2秒後の取り直しが走り出してから、ログイン通知が届く
    await flush(2000);
    expect(mockResolve).toHaveBeenCalledTimes(2);
    await emit(USER, "SIGNED_IN");

    await act(async () => {
      retry.resolve({ status: "signed-out" });
    });
    await flush(120_000);

    expect(result.current).toEqual(SIGNED_IN);
    expect(mockResolve).toHaveBeenCalledTimes(2);
  });

  test("表に戻って取り直しても失敗したら、次の間隔は倍になる", async () => {
    mockResolve.mockResolvedValue({ status: "unknown" });

    renderHook(() => useAuthUser());
    await flush();
    expect(mockResolve).toHaveBeenCalledTimes(1);

    // 2秒待たずに表へ戻って取り直す(2回目の失敗)
    setVisibility("hidden");
    setVisibility("visible");
    await flush();
    expect(mockResolve).toHaveBeenCalledTimes(2);

    // 次は4秒後
    await flush(3999);
    expect(mockResolve).toHaveBeenCalledTimes(2);
    await flush(1);
    expect(mockResolve).toHaveBeenCalledTimes(3);
  });

  test("アンマウント後は取り直さず購読も解除する", async () => {
    mockResolve.mockResolvedValue({ status: "unknown" });

    const { unmount } = renderHook(() => useAuthUser());
    await flush();
    expect(mockResolve).toHaveBeenCalledTimes(1);

    unmount();
    setVisibility("hidden");
    setVisibility("visible");
    await flush(120_000);

    expect(mockResolve).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
