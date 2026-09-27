/** @jest-environment jsdom */

/**
 * マイページ右上メニューのログアウト。
 *
 * 2026-09-27 に「押してもログアウトできない」と報告された場所。ログアウトは
 * useSignOut(失敗ならトースト、成功なら全画面遷移)に任せ、行き先はホーム。
 */

const stableTranslate = (key: string) => key;
// 既定の言語(ja)と区別できるよう en で確かめる
jest.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => stableTranslate,
}));

const mockPush = jest.fn();
const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

jest.mock("@/features/auth/lib/auth-client", () => ({
  signOut: jest.fn(),
}));

jest.mock("next/image", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    __esModule: true,
    default: ({ src, alt }: { src: string; alt: string }) =>
      React.createElement("img", { src, alt }),
  };
});

jest.mock("@/components/ui/dropdown-menu", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  type Props = { children?: React.ReactNode; onClick?: () => void; asChild?: boolean };
  return {
    DropdownMenu: ({ children }: Props) => React.createElement(React.Fragment, null, children),
    DropdownMenuTrigger: ({ children }: Props) =>
      React.createElement(React.Fragment, null, children),
    DropdownMenuContent: ({ children }: Props) => React.createElement("div", null, children),
    DropdownMenuItem: ({ children, onClick, asChild }: Props) =>
      asChild
        ? React.createElement(React.Fragment, null, children)
        : React.createElement("button", { type: "button", role: "menuitem", onClick }, children),
    DropdownMenuSeparator: () => React.createElement("hr"),
  };
});

jest.mock("@/components/LanguageSettingsMenu", () => ({
  LanguageSettingsMenu: () => null,
}));
jest.mock("@/features/my-page/components/ProfileEditModal", () => ({
  ProfileEditModal: () => null,
}));
jest.mock("@/features/my-page/components/AvatarUpload", () => ({
  AvatarUpload: () => null,
}));
jest.mock("@/features/posts/components/CollapsibleText", () => ({
  CollapsibleText: () => null,
}));
jest.mock("@/features/users/components/FollowButton", () => ({
  FollowButton: () => null,
}));
jest.mock("@/features/subscription/components/SubscriptionBadge", () => ({
  SubscriptionBadge: () => null,
}));

const mockSignOutAndLeave = jest.fn();
jest.mock("@/features/auth/hooks/use-sign-out", () => ({
  useSignOut: () => mockSignOutAndLeave,
}));

import { fireEvent, render, screen } from "@testing-library/react";
import { ProfileHeader } from "@/features/my-page/components/ProfileHeader";
import { signOut } from "@/features/auth/lib/auth-client";

const USER_ID = "11111111-1111-4111-8111-111111111111";

describe("ProfileHeader のログアウト", () => {
  beforeEach(() => {
    mockSignOutAndLeave.mockReset();
    mockSignOutAndLeave.mockResolvedValue(undefined);
    mockPush.mockReset();
    mockRefresh.mockReset();
    jest.mocked(signOut).mockReset();
  });

  test("ログアウトを押すとホームを添えて useSignOut に渡す", () => {
    render(
      <ProfileHeader
        profile={{
          id: USER_ID,
          nickname: "テストユーザー",
          bio: null,
          avatar_url: null,
        }}
        isOwnProfile
        userId={USER_ID}
        currentUserId={USER_ID}
      />
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "logout" }));

    expect(mockSignOutAndLeave).toHaveBeenCalledTimes(1);
    expect(mockSignOutAndLeave).toHaveBeenCalledWith("/en");
    // 直接のログアウトや、成否を待たないクライアント遷移は残っていない
    expect(signOut).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
