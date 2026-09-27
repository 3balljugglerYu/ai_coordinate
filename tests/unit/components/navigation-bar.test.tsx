/** @jest-environment jsdom */

import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NavigationBar } from "@/components/NavigationBar";
import { setLastGenerationModePath } from "@/features/generation/lib/generation-mode-preference";
import { TUTORIAL_STORAGE_KEYS } from "@/features/tutorial/types";

/**
 * ボトムナビ。カタログ刷新(段階公開中は運営のみ)で次のように変わる。
 *  - ホームの右に「カタログ」(/styles)が加わる
 *  - 「コーディネート」が「つくる」になり、押すと毎回 Free Style を開く
 * 刷新前(一般の閲覧者)はこれまでどおり。
 */

const pushMock = jest.fn();
const pathnameMock = jest.fn(() => "/ja");
jest.mock("next/navigation", () => ({
  usePathname: () => pathnameMock(),
  useRouter: () => ({ push: pushMock, prefetch: jest.fn() }),
}));

const NAV_LABELS: Record<string, string> = {
  home: "ホーム",
  coordinate: "コーディネート",
  catalog: "カタログ",
  create: "つくる",
  challenge: "ミッション",
  notifications: "お知らせ",
  myPage: "マイページ",
};
jest.mock("next-intl", () => ({
  useLocale: () => "ja",
  useTranslations: () => (key: string) => NAV_LABELS[key] ?? key,
}));

jest.mock("@/features/auth/lib/auth-client", () => ({
  getCurrentUser: () => Promise.resolve(null),
  onAuthStateChange: () => ({ unsubscribe: jest.fn() }),
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

const catalogRevampMock = jest.fn(() => false);
jest.mock("@/features/style-presets/hooks/useStylesCatalogRevamp", () => ({
  useStylesCatalogRevamp: () => catalogRevampMock(),
}));

async function renderNav() {
  await act(async () => {
    render(<NavigationBar />);
  });
  return within(screen.getByRole("navigation"));
}

function labels(buttons: HTMLElement[]) {
  return buttons.map((button) => button.textContent);
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  pathnameMock.mockReturnValue("/ja");
  catalogRevampMock.mockReturnValue(false);
});

describe("NavigationBar", () => {
  describe("刷新前(一般の閲覧者)", () => {
    test("これまでどおり5項目で「カタログ」は出さない", async () => {
      const nav = await renderNav();

      expect(labels(nav.getAllByRole("button"))).toEqual([
        "ホーム",
        "コーディネート",
        "ミッション",
        "お知らせ",
        "マイページ",
      ]);
    });

    test("「コーディネート」は前回使った生成モードへ戻る", async () => {
      setLastGenerationModePath("/coordinate");
      const nav = await renderNav();

      fireEvent.click(nav.getByRole("button", { name: "コーディネート" }));

      expect(pushMock).toHaveBeenCalledWith("/ja/coordinate");
    });

    test("/free にいても「コーディネート」は選択中にしない(これまでどおり)", async () => {
      pathnameMock.mockReturnValue("/ja/free");
      const nav = await renderNav();

      expect(
        nav.getByRole("button", { name: "コーディネート" }).className
      ).not.toContain("text-primary");
    });
  });

  describe("刷新後(運営・公開後)", () => {
    beforeEach(() => {
      catalogRevampMock.mockReturnValue(true);
    });

    test("ホームの右に「カタログ」、生成の入口は「つくる」の6項目", async () => {
      const nav = await renderNav();

      expect(labels(nav.getAllByRole("button"))).toEqual([
        "ホーム",
        "カタログ",
        "つくる",
        "ミッション",
        "お知らせ",
        "マイページ",
      ]);
      // チュートリアルの目印は「つくる」に付いたまま
      expect(
        nav.getByRole("button", { name: "つくる" }).getAttribute("data-tour")
      ).toBe("coordinate-nav-mobile");
    });

    test("「つくる」は前回のモードに関わらず Free Style を開く", async () => {
      setLastGenerationModePath("/style");
      const nav = await renderNav();

      fireEvent.click(nav.getByRole("button", { name: "つくる" }));

      expect(pushMock).toHaveBeenCalledWith("/ja/free");
    });

    test("チュートリアルツアー中の「つくる」は One-Tap Style を開く", async () => {
      window.sessionStorage.setItem(TUTORIAL_STORAGE_KEYS.IN_PROGRESS, "true");
      const nav = await renderNav();

      fireEvent.click(nav.getByRole("button", { name: "つくる" }));

      expect(pushMock).toHaveBeenCalledWith("/ja/style");
    });

    test("「カタログ」は Persta.AI ORIGINAL(/styles)を開く", async () => {
      const nav = await renderNav();

      fireEvent.click(nav.getByRole("button", { name: "カタログ" }));

      expect(pushMock).toHaveBeenCalledWith("/ja/styles");
    });

    test.each([
      ["/ja/styles", "カタログ"],
      ["/ja/user-styles", "カタログ"],
      ["/ja/free", "つくる"],
      ["/ja/style", "つくる"],
      ["/ja/coordinate", "つくる"],
    ])("%s では「%s」を選択中にする", async (pathname, activeLabel) => {
      pathnameMock.mockReturnValue(pathname);
      const nav = await renderNav();

      const active = nav
        .getAllByRole("button")
        .filter((button) => button.className.includes("text-primary"))
        .map((button) => button.textContent);
      expect(active).toEqual([activeLabel]);
    });

    test("6項目が狭い画面に収まるよう、最小幅をやめて長いラベルは省略する", async () => {
      const nav = await renderNav();

      const button = nav.getByRole("button", { name: "マイページ" });
      expect(button.className).toContain("min-w-0");
      expect(button.className).not.toContain("min-w-[60px]");
      expect(within(button).getByText("マイページ").className).toContain("truncate");
    });
  });
});
