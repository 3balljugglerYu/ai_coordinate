/** @jest-environment jsdom */

jest.mock("@/lib/supabase/client", () => ({
  createClient: jest.fn(),
}));

import { createClient } from "@/lib/supabase/client";
import { getLocaleCookieMaxAge, LOCALE_COOKIE } from "@/i18n/config";
import { signOut } from "@/features/auth/lib/auth-client";

describe("auth-client signOut locale persistence", () => {
  const createClientMock = createClient as jest.MockedFunction<
    typeof createClient
  >;
  let cookieSetterSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    cookieSetterSpy = jest.spyOn(Document.prototype, "cookie", "set");
    document.cookie = `${LOCALE_COOKIE}=; path=/; max-age=0`;
  });

  afterEach(() => {
    cookieSetterSpy.mockRestore();
  });

  test("signOut_NEXT_LOCALEが存在する場合_localeCookieを維持する", async () => {
    createClientMock.mockReturnValue({
      auth: {
        signOut: jest.fn().mockResolvedValue({ error: null }),
      },
    } as never);
    document.cookie = `${LOCALE_COOKIE}=en; path=/`;

    await signOut();

    expect(cookieSetterSpy).toHaveBeenLastCalledWith(
      `${LOCALE_COOKIE}=en; path=/; max-age=${getLocaleCookieMaxAge()}; samesite=lax`
    );
  });

  test("signOut_日本語localeでも同じ値でcookieを再設定する", async () => {
    const signOutMock = jest.fn().mockResolvedValue({ error: null });
    createClientMock.mockReturnValue({
      auth: {
        signOut: signOutMock,
      },
    } as never);
    document.cookie = `${LOCALE_COOKIE}=ja; path=/`;

    await signOut();

    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(cookieSetterSpy).toHaveBeenLastCalledWith(
      `${LOCALE_COOKIE}=ja; path=/; max-age=${getLocaleCookieMaxAge()}; samesite=lax`
    );
  });

  test("signOut_localeCookieが無い場合_DEFAULT_LOCALEでcookieを設定する", async () => {
    createClientMock.mockReturnValue({
      auth: {
        signOut: jest.fn().mockResolvedValue({ error: null }),
      },
    } as never);

    await signOut();

    expect(cookieSetterSpy).toHaveBeenLastCalledWith(
      `${LOCALE_COOKIE}=ja; path=/; max-age=${getLocaleCookieMaxAge()}; samesite=lax`
    );
  });

  test("signOut_認証エラーの場合_localeCookieを再設定せず例外を投げる", async () => {
    createClientMock.mockReturnValue({
      auth: {
        signOut: jest.fn().mockResolvedValue({
          error: { message: "network error" },
        }),
      },
    } as never);
    document.cookie = `${LOCALE_COOKIE}=ja; path=/`;

    await expect(signOut()).rejects.toThrow(
      "ネットワークエラーが発生しました。インターネット接続を確認してください。"
    );
    expect(cookieSetterSpy).toHaveBeenNthCalledWith(1, `${LOCALE_COOKIE}=; path=/; max-age=0`);
    expect(cookieSetterSpy).toHaveBeenNthCalledWith(2, `${LOCALE_COOKIE}=ja; path=/`);
  });

  test("signOut_cookieの有効期限はlocale cookie設定と同じ値を使う", async () => {
    createClientMock.mockReturnValue({
      auth: {
        signOut: jest.fn().mockResolvedValue({ error: null }),
      },
    } as never);
    document.cookie = `${LOCALE_COOKIE}=en; path=/`;

    await signOut();

    expect(cookieSetterSpy).toHaveBeenLastCalledWith(
      `${LOCALE_COOKIE}=en; path=/; max-age=${getLocaleCookieMaxAge()}; samesite=lax`
    );
  });
});
