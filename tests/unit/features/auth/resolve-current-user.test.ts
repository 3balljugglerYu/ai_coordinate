/** @jest-environment jsdom */

/**
 * resolveCurrentUser: ログイン確認の結果を「ログイン中 / 未ログイン / 分からない」に分ける。
 *
 * 以前の getCurrentUser は、通信失敗やロック待ちの失敗でも null を返したため、
 * ヘッダーが「確認できなかった」を「ログインしていない」と取り違えて
 * 「ログイン」ボタンを出していた(2026-09-27)。
 * 未ログインと言い切れるのは、セッションが無い・トークンが拒否された場合だけ。
 */

jest.mock("@/lib/supabase/client", () => ({
  createClient: jest.fn(),
}));

import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  type AuthChangeEvent,
  type Session,
} from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  onAuthStateChange,
  resolveCurrentUser,
} from "@/features/auth/lib/auth-client";

const mockCreateClient = jest.mocked(createClient);

const USER = { id: "11111111-1111-4111-8111-111111111111" };

function useGetUser(getUser: jest.Mock) {
  mockCreateClient.mockReturnValue({ auth: { getUser } } as never);
}

describe("resolveCurrentUser", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("resolveCurrentUser はユーザーがいれば signed-in", async () => {
    const getUser = jest
      .fn()
      .mockResolvedValue({ data: { user: USER }, error: null });
    useGetUser(getUser);

    await expect(resolveCurrentUser()).resolves.toEqual({
      status: "signed-in",
      user: USER,
    });
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["セッションが無い", new AuthSessionMissingError()],
    ["トークンが拒否された(401)", new AuthApiError("invalid JWT", 401, "bad_jwt")],
    ["トークンが拒否された(403)", new AuthApiError("invalid JWT", 403, "bad_jwt")],
    ["ユーザーもエラーも無い", null],
  ])("セッション無しと401/403は signed-out: %s", async (_label, error) => {
    const getUser = jest
      .fn()
      .mockResolvedValue({ data: { user: null }, error });
    useGetUser(getUser);

    await expect(resolveCurrentUser()).resolves.toEqual({
      status: "signed-out",
    });
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["通信エラー", { data: { user: null }, error: new AuthRetryableFetchError("Load failed", 0) }],
    ["サーバーエラー(500)", { data: { user: null }, error: new AuthApiError("boom", 500, "unexpected_failure") }],
    ["混雑(429)", { data: { user: null }, error: new AuthApiError("slow down", 429, "over_request_rate_limit") }],
    ["その他の要求エラー(400)", { data: { user: null }, error: new AuthApiError("Invalid Refresh Token: Already Used", 400, "refresh_token_already_used") }],
  ])("通信失敗や例外は unknown: %s", async (_label, response) => {
    const getUser = jest.fn().mockResolvedValue(response);
    useGetUser(getUser);

    await expect(resolveCurrentUser()).resolves.toEqual({ status: "unknown" });
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  test("通信失敗や例外は unknown: ロック待ちの AbortError", async () => {
    const getUser = jest
      .fn()
      .mockRejectedValue(
        new DOMException("signal is aborted without reason", "AbortError")
      );
    useGetUser(getUser);

    await expect(resolveCurrentUser()).resolves.toEqual({ status: "unknown" });
    expect(getUser).toHaveBeenCalledTimes(1);
  });
});

describe("onAuthStateChange", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("onAuthStateChange はイベント名も渡す", () => {
    let emit: ((event: AuthChangeEvent, session: Session | null) => void) | null =
      null;
    const subscription = { unsubscribe: jest.fn() };
    const supabaseOnAuthStateChange = jest.fn((listener) => {
      emit = listener;
      return { data: { subscription } };
    });
    mockCreateClient.mockReturnValue({
      auth: { onAuthStateChange: supabaseOnAuthStateChange },
    } as never);
    const callback = jest.fn();

    const returned = onAuthStateChange(callback);
    emit!("SIGNED_OUT", null);
    emit!("TOKEN_REFRESHED", { user: USER } as unknown as Session);

    expect(returned).toBe(subscription);
    expect(callback).toHaveBeenNthCalledWith(1, null, "SIGNED_OUT");
    expect(callback).toHaveBeenNthCalledWith(2, USER, "TOKEN_REFRESHED");
  });
});
