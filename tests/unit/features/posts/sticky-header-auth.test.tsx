/** @jest-environment jsdom */

/**
 * ヘッダー右上のログイン表示。
 *
 * 2026-09-27 の不具合: ログイン確認が(ロック待ち・通信失敗で)失敗すると、
 * ヘッダーはそれを「未ログイン」と取り違えて「ログイン」ボタンを出し、
 * 画面遷移しても戻らなかった。サーバーは Cookie で本人と分かっているので、
 * 「ログイン」を押すとマイページに入れてしまい、利用者には意味が分からなかった。
 *
 * ここで守ること:
 *  - ログイン中はアバター、未ログインが確定したときだけ「ログイン」
 *  - 確認に失敗している間は「ログイン」も「保存する」も出さず、取り直して成功したらアバター
 *  - アバター画像の取得に失敗してもログイン中の表示は崩さない
 *  - ログアウトはホームへの遷移先を添えて useSignOut に渡す
 */

const stableTranslate = (key: string) => key;
jest.mock("next-intl", () => ({
  useLocale: () => "ja",
  useTranslations: () => stableTranslate,
}));

jest.mock("next/navigation", () => ({
  usePathname: () => "/ja",
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
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

jest.mock("@/features/posts/components/SearchBar", () => ({
  SearchBar: () => null,
}));

jest.mock("@/features/posts/components/SearchAvailabilityProvider", () => ({
  useSearchAvailable: () => false,
}));

jest.mock("@/features/auth/components/AuthModal", () => ({
  AuthModal: () => null,
}));

let mockHasGuestImage = false;
jest.mock("@/features/wardrobe/hooks/use-wardrobe-save", () => ({
  useWardrobeSaveTrigger: () => ({
    hasGuestImage: mockHasGuestImage,
    trigger: jest.fn(),
    authModalProps: {},
  }),
}));

jest.mock("@/features/posts/lib/in-app-history", () => ({
  recordInAppNavigation: jest.fn(),
  hasInAppHistory: () => false,
}));

jest.mock("@/features/auth/lib/auth-client", () => ({
  resolveCurrentUser: jest.fn(),
  onAuthStateChange: jest.fn(),
}));

const mockSignOutAndLeave = jest.fn();
jest.mock("@/features/auth/hooks/use-sign-out", () => ({
  useSignOut: () => mockSignOutAndLeave,
}));

const mockMaybeSingle = jest.fn();
const mockAvatarQuery = jest.fn();
jest.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: string) => {
          mockAvatarQuery({ table, columns, column, value });
          return { maybeSingle: mockMaybeSingle };
        },
      }),
    }),
  }),
}));

import { act, fireEvent, render, screen } from "@testing-library/react";
import type { AuthChangeEvent, User } from "@supabase/supabase-js";
import { StickyHeader } from "@/features/posts/components/StickyHeader";
import {
  onAuthStateChange,
  resolveCurrentUser,
} from "@/features/auth/lib/auth-client";

const mockResolve = jest.mocked(resolveCurrentUser);
const mockOnAuthStateChange = jest.mocked(onAuthStateChange);
let authListener: ((user: User | null, event: AuthChangeEvent) => void) | null =
  null;

const USER = { id: "11111111-1111-4111-8111-111111111111" } as User;
const AVATAR_URL = "https://example.com/avatar.png";

async function flush(ms = 0) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

function loginLink(container: HTMLElement) {
  return container.querySelector('header a[href="/login"]');
}

function userMenuTrigger() {
  return screen.queryByTestId("sticky-header-user-menu");
}

function skeleton(container: HTMLElement) {
  return container.querySelector("header .animate-pulse");
}

describe("StickyHeader のログイン表示", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockResolve.mockReset();
    mockOnAuthStateChange.mockReset();
    authListener = null;
    mockOnAuthStateChange.mockImplementation((callback) => {
      authListener = callback;
      return { unsubscribe: jest.fn() } as never;
    });
    mockAvatarQuery.mockReset();
    mockMaybeSingle.mockReset();
    mockMaybeSingle.mockResolvedValue({
      data: { avatar_url: AVATAR_URL },
      error: null,
    });
    mockSignOutAndLeave.mockReset();
    mockHasGuestImage = false;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test("ヘッダーはログイン中ならアバター", async () => {
    mockResolve.mockResolvedValue({ status: "signed-in", user: USER });

    const { container } = render(<StickyHeader />);
    await flush();

    expect(loginLink(container)).toBeNull();
    expect(screen.getByAltText("userAlt")).toHaveAttribute("src", AVATAR_URL);
    expect(mockAvatarQuery).toHaveBeenCalledWith({
      table: "profiles",
      columns: "avatar_url",
      column: "user_id",
      value: USER.id,
    });
  });

  test("アバターを取り終えるまではスケルトンのまま", async () => {
    let resolveAvatar: (value: unknown) => void = () => {};
    mockMaybeSingle.mockReturnValue(
      new Promise((resolve) => {
        resolveAvatar = resolve;
      })
    );
    mockResolve.mockResolvedValue({ status: "signed-in", user: USER });

    const { container } = render(<StickyHeader />);
    await flush();

    expect(skeleton(container)).not.toBeNull();
    expect(userMenuTrigger()).toBeNull();
    expect(loginLink(container)).toBeNull();

    await act(async () => {
      resolveAvatar({ data: { avatar_url: AVATAR_URL }, error: null });
    });
    await flush();

    expect(screen.getByAltText("userAlt")).toHaveAttribute("src", AVATAR_URL);
    expect(skeleton(container)).toBeNull();
  });

  test.each([
    [
      "通信の例外",
      () => mockMaybeSingle.mockRejectedValue(new TypeError("Load failed")),
    ],
    [
      "エラー入りの結果",
      () =>
        mockMaybeSingle.mockResolvedValue({
          data: null,
          error: { message: "TypeError: Load failed" },
        }),
    ],
  ])("アバターの取得に失敗してもログイン中の表示を保つ: %s", async (_label, arrange) => {
    arrange();
    mockResolve.mockResolvedValue({ status: "signed-in", user: USER });
    jest.spyOn(console, "error").mockImplementation(() => {});

    const { container } = render(<StickyHeader />);
    await flush();

    // 「ログイン」には倒さず、画像なし(人型アイコン)でメニューを出す
    expect(loginLink(container)).toBeNull();
    expect(skeleton(container)).toBeNull();
    expect(userMenuTrigger()).not.toBeNull();
    expect(screen.queryByAltText("userAlt")).toBeNull();
  });

  test("アバターを変えたらヘッダーの画像も変わる", async () => {
    const NEW_AVATAR_URL = "https://example.com/new-avatar.png";
    mockResolve.mockResolvedValue({ status: "signed-in", user: USER });

    render(<StickyHeader />);
    await flush();
    expect(screen.getByAltText("userAlt")).toHaveAttribute("src", AVATAR_URL);

    // マイページでアバターを変えたときの通知(AvatarUpload が送る)
    act(() => {
      window.dispatchEvent(
        new CustomEvent("profile:avatarUpdated", {
          detail: { avatarUrl: NEW_AVATAR_URL },
        })
      );
    });

    expect(screen.getByAltText("userAlt")).toHaveAttribute("src", NEW_AVATAR_URL);

    // 続けて変えても追従する
    const NEWER_AVATAR_URL = "https://example.com/newer-avatar.png";
    act(() => {
      window.dispatchEvent(
        new CustomEvent("profile:avatarUpdated", {
          detail: { avatarUrl: NEWER_AVATAR_URL },
        })
      );
    });
    expect(screen.getByAltText("userAlt")).toHaveAttribute("src", NEWER_AVATAR_URL);
  });

  test("別のアカウントに切り替わったら、そのアバターを取り終えるまで前の人のアバターを出さない", async () => {
    const OTHER_USER = { id: "22222222-2222-4222-8222-222222222222" } as User;
    const OTHER_AVATAR_URL = "https://example.com/other-avatar.png";
    let resolveOtherAvatar: (value: unknown) => void = () => {};
    mockMaybeSingle
      .mockResolvedValueOnce({ data: { avatar_url: AVATAR_URL }, error: null })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOtherAvatar = resolve;
        })
      );
    mockResolve.mockResolvedValue({ status: "signed-in", user: USER });

    const { container } = render(<StickyHeader />);
    await flush();
    expect(screen.getByAltText("userAlt")).toHaveAttribute("src", AVATAR_URL);

    // 別タブで別のアカウントにログインした通知
    expect(authListener).toEqual(expect.any(Function));
    await act(async () => {
      authListener!(OTHER_USER, "SIGNED_IN");
    });
    await flush();

    expect(screen.queryByAltText("userAlt")).toBeNull();
    expect(skeleton(container)).not.toBeNull();
    expect(loginLink(container)).toBeNull();

    await act(async () => {
      resolveOtherAvatar({ data: { avatar_url: OTHER_AVATAR_URL }, error: null });
    });
    await flush();

    expect(screen.getByAltText("userAlt")).toHaveAttribute("src", OTHER_AVATAR_URL);
    expect(mockAvatarQuery).toHaveBeenLastCalledWith({
      table: "profiles",
      columns: "avatar_url",
      column: "user_id",
      value: OTHER_USER.id,
    });
  });

  test("ヘッダーは未ログイン確定でログインリンク", async () => {
    mockResolve.mockResolvedValue({ status: "signed-out" });

    const { container } = render(<StickyHeader />);
    await flush();

    expect(loginLink(container)).not.toBeNull();
    expect(userMenuTrigger()).toBeNull();
  });

  test("確認失敗の間はログインリンクを出さない", async () => {
    // 1回目はロック待ちの失敗、取り直し(2秒後)で成功する
    mockResolve
      .mockResolvedValueOnce({ status: "unknown" })
      .mockResolvedValueOnce({ status: "signed-in", user: USER });

    const { container } = render(<StickyHeader />);
    await flush();

    expect(loginLink(container)).toBeNull();
    expect(userMenuTrigger()).toBeNull();
    expect(skeleton(container)).not.toBeNull();

    await flush(2000);

    expect(loginLink(container)).toBeNull();
    expect(screen.getByAltText("userAlt")).toHaveAttribute("src", AVATAR_URL);
  });

  test("確認失敗の間は保存するボタンも出さない", async () => {
    mockHasGuestImage = true;
    mockResolve
      .mockResolvedValueOnce({ status: "unknown" })
      .mockResolvedValueOnce({ status: "signed-out" });

    const { container } = render(<StickyHeader />);
    await flush();

    expect(
      screen.queryByRole("button", { name: "wardrobeSaveButton" })
    ).toBeNull();
    expect(loginLink(container)).toBeNull();
    expect(skeleton(container)).not.toBeNull();

    // 取り直しで未ログインが確定したら、生成後のゲストには「保存する」を出す
    await flush(2000);
    expect(
      screen.getByRole("button", { name: "wardrobeSaveButton" })
    ).toBeInTheDocument();
    expect(loginLink(container)).toBeNull();
  });

  test("ログアウトを押すとホームを添えて useSignOut に渡す", async () => {
    mockResolve.mockResolvedValue({ status: "signed-in", user: USER });

    render(<StickyHeader />);
    await flush();

    fireEvent.click(screen.getByRole("menuitem", { name: "logout" }));

    expect(mockSignOutAndLeave).toHaveBeenCalledTimes(1);
    expect(mockSignOutAndLeave).toHaveBeenCalledWith("/ja");
  });
});
