/** @jest-environment jsdom */

/**
 * PC 用サイドバー下段のログイン／ログアウト表示。
 *
 * ヘッダーと同じく、ログイン確認の失敗を「未ログイン」と取り違えると、
 * ログイン中なのに「ログイン」ボタンが出てログアウトもできなくなる(2026-09-27)。
 * 確認に失敗している間はログイン・ログアウト・保存するのどれも出さず、
 * 取り直して成功したらログアウトを出す。
 */

const stableTranslate = (key: string) => key;
jest.mock("next-intl", () => ({
  useLocale: () => "ja",
  useTranslations: () => stableTranslate,
}));

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  usePathname: () => "/ja",
  useRouter: () => ({ push: mockPush, prefetch: jest.fn(), refresh: jest.fn() }),
}));

jest.mock("@/components/LanguageSettingsMenu", () => ({
  LanguageSettingsMenu: () => null,
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

jest.mock("@/features/notifications/components/UnreadNotificationProvider", () => ({
  useUnreadNotificationCount: () => ({
    hasSidebarDot: false,
    markAnnouncementPageSeen: jest.fn(),
  }),
}));

jest.mock("@/features/challenges/components/MissionDotProvider", () => ({
  useMissionDots: () => ({
    hasMissionTabDot: false,
    markMissionTabSnoozed: jest.fn(),
  }),
}));

jest.mock("@/features/generation/lib/coordinate-source-stock-save-prompt-state", () => ({
  getCoordinateSourceStockSavePromptDot: () => false,
  subscribeCoordinateSourceStockSavePromptDot: () => () => {},
}));

jest.mock("@/features/auth/lib/auth-client", () => ({
  resolveCurrentUser: jest.fn(),
  onAuthStateChange: jest.fn(),
}));

const mockSignOutAndLeave = jest.fn();
jest.mock("@/features/auth/hooks/use-sign-out", () => ({
  useSignOut: () => mockSignOutAndLeave,
}));

import { act, fireEvent, render, screen } from "@testing-library/react";
import type { User } from "@supabase/supabase-js";
import { AppSidebar } from "@/components/AppSidebar";
import {
  onAuthStateChange,
  resolveCurrentUser,
} from "@/features/auth/lib/auth-client";

const mockResolve = jest.mocked(resolveCurrentUser);
const mockOnAuthStateChange = jest.mocked(onAuthStateChange);

const USER = { id: "11111111-1111-4111-8111-111111111111" } as User;

async function flush(ms = 0) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

function sidebar() {
  return screen.getByRole("complementary", { name: "アプリのナビゲーション" });
}

function authButtons() {
  return {
    login: screen.queryByRole("button", { name: "login" }),
    logout: screen.queryByRole("button", { name: "logout" }),
    save: screen.queryByRole("button", { name: "wardrobeSaveButton" }),
  };
}

describe("AppSidebar のログイン／ログアウト表示", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockResolve.mockReset();
    mockPush.mockReset();
    mockOnAuthStateChange.mockReset();
    mockOnAuthStateChange.mockReturnValue({ unsubscribe: jest.fn() } as never);
    mockSignOutAndLeave.mockReset();
    mockHasGuestImage = false;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("サイドバーは確認失敗の間ログインボタンを出さない", async () => {
    mockResolve
      .mockResolvedValueOnce({ status: "unknown" })
      .mockResolvedValueOnce({ status: "signed-in", user: USER });

    render(<AppSidebar />);
    await flush();

    expect(sidebar()).toBeInTheDocument();
    expect(authButtons()).toEqual({ login: null, logout: null, save: null });

    // 取り直し(2秒後)で成功したらログアウトを出す
    await flush(2000);
    expect(authButtons().logout).not.toBeNull();
    expect(authButtons().login).toBeNull();
  });

  test("確認失敗の間は保存するボタンも出さない", async () => {
    mockHasGuestImage = true;
    mockResolve
      .mockResolvedValueOnce({ status: "unknown" })
      .mockResolvedValueOnce({ status: "signed-out" });

    render(<AppSidebar />);
    await flush();

    expect(sidebar()).toBeInTheDocument();
    expect(authButtons()).toEqual({ login: null, logout: null, save: null });

    // 取り直しで未ログインが確定したら、生成後のゲストには「保存する」を出す
    await flush(2000);
    expect(authButtons().save).not.toBeNull();
    expect(authButtons().login).toBeNull();
  });

  test("ログイン中はログアウトを出し、押すとホームを添えて useSignOut に渡す", async () => {
    mockResolve.mockResolvedValue({ status: "signed-in", user: USER });

    render(<AppSidebar />);
    await flush();

    expect(authButtons().login).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "logout" }));

    expect(mockSignOutAndLeave).toHaveBeenCalledTimes(1);
    expect(mockSignOutAndLeave).toHaveBeenCalledWith("/ja");
  });

  test("確認中はマイページへそのまま進む(ログインへは回さない)", async () => {
    mockResolve.mockReturnValue(new Promise(() => {}));

    render(<AppSidebar />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "myPage" }));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/my-page");
  });

  test("未ログインが確定していればマイページはログインへ回す", async () => {
    mockResolve.mockResolvedValue({ status: "signed-out" });

    render(<AppSidebar />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "myPage" }));

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/login?redirect=/");
  });

  test("未ログインが確定したらログインボタンを出す", async () => {
    mockResolve.mockResolvedValue({ status: "signed-out" });

    render(<AppSidebar />);
    await flush();

    expect(authButtons().login).not.toBeNull();
    expect(authButtons().logout).toBeNull();
  });
});
