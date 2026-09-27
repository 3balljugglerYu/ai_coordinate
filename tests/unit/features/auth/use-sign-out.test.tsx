/** @jest-environment jsdom */

/**
 * useSignOut: ヘッダー・サイドバー・マイページ・退会復帰画面のログアウト操作。
 *
 * 以前はログアウトに失敗しても console に出すだけで、画面は何も変わらなかった
 * (2026-09-27: 「押してもログアウトできない」)。
 *  - 成功したら全画面遷移する(サーバー経由でログアウトした場合もタブの表示を揃える)
 *  - 失敗したらトーストで知らせ、遷移しない
 */

jest.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

const mockToast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

jest.mock("@/features/auth/lib/auth-client", () => ({
  signOut: jest.fn(),
}));

jest.mock("@/lib/full-page-navigation", () => ({
  navigateFullPage: jest.fn(),
}));

import { act, renderHook } from "@testing-library/react";
import { locales } from "@/i18n/config";
import { getClientMessages } from "@/i18n/messages";
import { signOut } from "@/features/auth/lib/auth-client";
import { navigateFullPage } from "@/lib/full-page-navigation";
import { useSignOut } from "@/features/auth/hooks/use-sign-out";

const mockSignOut = jest.mocked(signOut);
const mockNavigateFullPage = jest.mocked(navigateFullPage);

const DESTINATION = "/en/some-place?from=logout-test";

describe("useSignOut", () => {
  beforeEach(() => {
    mockSignOut.mockReset();
    mockToast.mockReset();
    mockNavigateFullPage.mockReset();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("成功したら全画面遷移する", async () => {
    mockSignOut.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSignOut());

    await act(async () => {
      await result.current(DESTINATION);
    });

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockNavigateFullPage).toHaveBeenCalledTimes(1);
    expect(mockNavigateFullPage).toHaveBeenCalledWith(DESTINATION);
    expect(mockToast).not.toHaveBeenCalled();
  });

  test("失敗したらトーストで知らせる", async () => {
    mockSignOut.mockRejectedValue(new Error("network error"));
    const { result } = renderHook(() => useSignOut());

    await act(async () => {
      await result.current(DESTINATION);
    });

    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith({
      variant: "destructive",
      title: "nav.logoutFailed",
    });
    expect(mockNavigateFullPage).not.toHaveBeenCalled();
  });

  test("ログアウトの結果を処理し終えるまで完了しない", async () => {
    // 返す Promise は結果の処理(遷移またはトースト)が済んでから解決する(呼び出し側が待てるように)
    let finishSignOut: () => void = () => {};
    mockSignOut.mockReturnValue(
      new Promise<void>((resolve) => {
        finishSignOut = resolve;
      })
    );
    const { result } = renderHook(() => useSignOut());

    let settled = false;
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current(DESTINATION).then(() => {
        settled = true;
      });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(settled).toBe(false);
    expect(mockNavigateFullPage).not.toHaveBeenCalled();

    await act(async () => {
      finishSignOut();
      await pending;
    });
    expect(settled).toBe(true);
    expect(mockNavigateFullPage).toHaveBeenCalledWith(DESTINATION);
  });

  test.each(locales)("失敗時の文言が翻訳にある: %s", async (locale) => {
    const messages = await getClientMessages(locale);
    const nav = messages.nav as Record<string, unknown>;

    expect(typeof nav.logoutFailed).toBe("string");
    expect((nav.logoutFailed as string).length).toBeGreaterThan(0);
  });
});
