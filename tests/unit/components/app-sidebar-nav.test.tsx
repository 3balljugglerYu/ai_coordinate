/** @jest-environment jsdom */

/**
 * PC 用サイドバーのナビの項目。
 *
 * カタログ刷新(公開前は運営だけ)では、生成の入口を「カタログ」1つにまとめる
 * (「つくる」は無い。docs/planning/catalog-three-tabs-implementation-plan.md ADR-004)。
 * 刷新前(一般の利用者)はこれまでどおり。
 */

const stableTranslate = (key: string) => key;
jest.mock("next-intl", () => ({
  useLocale: () => "ja",
  useTranslations: () => stableTranslate,
}));

const mockPush = jest.fn();
const mockPrefetch = jest.fn();
const mockPathname = jest.fn(() => "/ja");
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: mockPush, prefetch: mockPrefetch, refresh: jest.fn() }),
}));

jest.mock("@/components/LanguageSettingsMenu", () => ({
  LanguageSettingsMenu: () => null,
}));

jest.mock("@/features/auth/components/AuthModal", () => ({
  AuthModal: () => null,
}));

jest.mock("@/features/wardrobe/hooks/use-wardrobe-save", () => ({
  useWardrobeSaveTrigger: () => ({
    hasGuestImage: false,
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

const mockCatalogRevamp = jest.fn(() => false);
jest.mock("@/features/style-presets/hooks/useStylesCatalogRevamp", () => ({
  useStylesCatalogRevamp: () => mockCatalogRevamp(),
}));

jest.mock("@/features/auth/hooks/use-sign-out", () => ({
  useSignOut: () => jest.fn(),
}));

import { act, fireEvent, render, screen } from "@testing-library/react";
import { AppSidebar } from "@/components/AppSidebar";
import {
  onAuthStateChange,
  resolveCurrentUser,
} from "@/features/auth/lib/auth-client";
import { TUTORIAL_STORAGE_KEYS } from "@/features/tutorial/types";
import { setLastGenerationModePath } from "@/features/generation/lib/generation-mode-preference";

const mockResolve = jest.mocked(resolveCurrentUser);
const mockOnAuthStateChange = jest.mocked(onAuthStateChange);

const NAV_KEYS = [
  "home",
  "catalog",
  "coordinate",
  "create",
  "challenge",
  "notifications",
  "myPage",
];

function navButtons() {
  return screen
    .getAllByRole("button")
    .filter((button) => NAV_KEYS.includes(button.getAttribute("aria-label") ?? ""));
}

function navLabels() {
  return navButtons().map((button) => button.getAttribute("aria-label"));
}

async function renderSidebar() {
  await act(async () => {
    render(<AppSidebar />);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  mockPathname.mockReturnValue("/ja");
  mockResolve.mockResolvedValue({ status: "signed-out" } as never);
  mockOnAuthStateChange.mockReturnValue({ unsubscribe: jest.fn() } as never);
});

describe("AppSidebar のナビの項目", () => {
  describe("刷新前(一般の利用者)", () => {
    beforeEach(() => {
      mockCatalogRevamp.mockReturnValue(false);
    });

    test("これまでどおり「コーディネート」を含む5項目で、目印もそこに付く", async () => {
      await renderSidebar();

      expect(navLabels()).toEqual([
        "home",
        "coordinate",
        "challenge",
        "notifications",
        "myPage",
      ]);
      expect(
        screen.getByRole("button", { name: "coordinate" }).getAttribute("data-tour")
      ).toBe("coordinate-nav-desktop");
      // ツアーは querySelector で最初の1つを指すので、目印は1つだけ
      expect(
        document.querySelectorAll('[data-tour="coordinate-nav-desktop"]')
      ).toHaveLength(1);
    });

    /*
      ⭐ 押したときの行き先の決め方を、刷新後の「カタログ」と共通の関数にまとめた
      (lib/nav-entries.ts)。一般の利用者の「コーディネート」の動きは今のまま。
    */
    test("「コーディネート」は前回使った生成モードへ戻る", async () => {
      setLastGenerationModePath("/free");
      await renderSidebar();

      fireEvent.click(screen.getByRole("button", { name: "coordinate" }));

      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith("/ja/free");
    });

    test("チュートリアルツアー中の「コーディネート」は One-Tap Style を開く", async () => {
      setLastGenerationModePath("/free");
      window.sessionStorage.setItem(TUTORIAL_STORAGE_KEYS.IN_PROGRESS, "true");
      await renderSidebar();

      fireEvent.click(screen.getByRole("button", { name: "coordinate" }));

      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith("/ja/style");
    });

    test("前回のモードの画面(/free)にいるときに「コーディネート」を押しても、どこへも行かない", async () => {
      setLastGenerationModePath("/free");
      mockPathname.mockReturnValue("/ja/free");
      await renderSidebar();

      fireEvent.click(screen.getByRole("button", { name: "coordinate" }));

      expect(mockPush).not.toHaveBeenCalled();
    });

    test.each<[string, string[]]>([
      ["/ja/style", ["coordinate"]],
      ["/ja/free", []],
      ["/ja/styles", []],
      ["/ja/user-styles", []],
    ])("%s で選択中の項目はこれまでどおり %j", async (pathname, expected) => {
      mockPathname.mockReturnValue(pathname);
      await renderSidebar();

      const active = navButtons()
        .filter((button) => button.className.includes("text-primary"))
        .map((button) => button.getAttribute("aria-label"));
      expect(active).toEqual(expected);
    });
  });

  describe("刷新後(運営・公開後)", () => {
    beforeEach(() => {
      mockCatalogRevamp.mockReturnValue(true);
    });

    test("ホームの右に「カタログ」を置いた5項目で、「つくる」は無い", async () => {
      await renderSidebar();

      expect(navLabels()).toEqual([
        "home",
        "catalog",
        "challenge",
        "notifications",
        "myPage",
      ]);
    });

    test("チュートリアルの目印は「カタログ」に付ける", async () => {
      await renderSidebar();

      expect(
        screen.getByRole("button", { name: "catalog" }).getAttribute("data-tour")
      ).toBe("coordinate-nav-desktop");
      expect(
        document.querySelectorAll('[data-tour="coordinate-nav-desktop"]')
      ).toHaveLength(1);
    });

    test("「カタログ」はペルスタのカタログ(/styles)を開く", async () => {
      await renderSidebar();

      fireEvent.click(screen.getByRole("button", { name: "catalog" }));

      expect(mockPush).toHaveBeenCalledWith("/ja/styles");
    });

    test("チュートリアルツアー中の「カタログ」は One-Tap Style を開く", async () => {
      window.sessionStorage.setItem(TUTORIAL_STORAGE_KEYS.IN_PROGRESS, "true");
      await renderSidebar();

      fireEvent.click(screen.getByRole("button", { name: "catalog" }));

      expect(mockPush).toHaveBeenCalledWith("/ja/style");
    });

    // ペルスタのカタログ(/styles)にいても、ツアー中の行き先は /style なので進む(ツアーを止めない)
    test("ツアー中はペルスタのカタログ(/styles)にいても、「カタログ」で One-Tap Style を開く", async () => {
      window.sessionStorage.setItem(TUTORIAL_STORAGE_KEYS.IN_PROGRESS, "true");
      mockPathname.mockReturnValue("/ja/styles");
      await renderSidebar();

      fireEvent.click(screen.getByRole("button", { name: "catalog" }));

      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith("/ja/style");
    });

    /*
      ⭐ 「カタログ」を選択中にしている画面(/free・/style・/user-styles)でも、押せば
      ペルスタのカタログへ行く。「選択中なら何もしない」にすると、ここから戻れなくなる。
    */
    test.each(["/ja/free", "/ja/style", "/ja/user-styles"])(
      "%s にいるときに「カタログ」を押すと、ペルスタのカタログ(/styles)を開く",
      async (pathname) => {
        mockPathname.mockReturnValue(pathname);
        await renderSidebar();

        fireEvent.click(screen.getByRole("button", { name: "catalog" }));

        expect(mockPush).toHaveBeenCalledTimes(1);
        expect(mockPush).toHaveBeenCalledWith("/ja/styles");
      }
    );

    /*
      行き先(押したときに決め直したパス)が今の画面と同じなら、何もしない。ツアー中の
      /style は、項目のパス(/styles)ではなく決め直した行き先(/style)で比べている行。
    */
    test.each<[string, boolean]>([
      ["/ja/styles", false],
      ["/ja/style", true],
    ])(
      "%s にいて(ツアー中=%s)「カタログ」の行き先が今の画面なら、どこへも行かない",
      async (pathname, tourInProgress) => {
        if (tourInProgress) {
          window.sessionStorage.setItem(TUTORIAL_STORAGE_KEYS.IN_PROGRESS, "true");
        }
        mockPathname.mockReturnValue(pathname);
        await renderSidebar();

        fireEvent.click(screen.getByRole("button", { name: "catalog" }));

        expect(mockPush).not.toHaveBeenCalled();
      }
    );

    test.each(["/ja/styles", "/ja/user-styles", "/ja/free", "/ja/style"])(
      "%s では「カタログ」を選択中にする",
      async (pathname) => {
        mockPathname.mockReturnValue(pathname);
        await renderSidebar();

        const active = navButtons()
          .filter((button) => button.className.includes("text-primary"))
          .map((button) => button.getAttribute("aria-label"));
        expect(active).toEqual(["catalog"]);
      }
    );
  });
});
