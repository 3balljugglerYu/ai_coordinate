/** @jest-environment jsdom */

/**
 * 退会予約中の画面(/account/reactivate)のログアウト。
 *
 * 以前は signOut の失敗を受け止めておらず、失敗すると何も起きなかった。
 * ログアウトは useSignOut(失敗ならトースト、成功なら全画面遷移)に任せ、行き先はログイン画面。
 */

const stableTranslate = (key: string) => key;
jest.mock("next-intl", () => ({
  useLocale: () => "ja",
  useTranslations: () => stableTranslate,
}));

const mockPush = jest.fn();
const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

jest.mock("@/features/auth/lib/auth-client", () => ({
  reactivateAccount: jest.fn(),
  signOut: jest.fn(),
}));

const mockSignOutAndLeave = jest.fn();
jest.mock("@/features/auth/hooks/use-sign-out", () => ({
  useSignOut: () => mockSignOutAndLeave,
}));

import { fireEvent, render, screen } from "@testing-library/react";
import { ReactivateAccountCard } from "@/features/auth/components/ReactivateAccountCard";
import { signOut } from "@/features/auth/lib/auth-client";

describe("ReactivateAccountCard のログアウト", () => {
  beforeEach(() => {
    mockSignOutAndLeave.mockReset();
    mockSignOutAndLeave.mockResolvedValue(undefined);
    mockPush.mockReset();
    mockRefresh.mockReset();
    jest.mocked(signOut).mockReset();
  });

  test("ログアウトを押すとログイン画面を添えて useSignOut に渡す", () => {
    render(<ReactivateAccountCard deletionScheduledAt={null} />);

    fireEvent.click(screen.getByRole("button", { name: "reactivateLogout" }));

    expect(mockSignOutAndLeave).toHaveBeenCalledTimes(1);
    expect(mockSignOutAndLeave).toHaveBeenCalledWith("/login");
    // 直接のログアウトや、成否を待たないクライアント遷移は残っていない
    // (失敗しても遷移してしまうと「失敗はトーストで知らせる」が崩れる)
    expect(signOut).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
