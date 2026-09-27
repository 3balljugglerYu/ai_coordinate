/** @jest-environment jsdom */

import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NavigationBar } from "@/components/NavigationBar";
import {
  LAST_GENERATION_MODE_STORAGE_KEY,
  setLastGenerationModePath,
} from "@/features/generation/lib/generation-mode-preference";
import { TUTORIAL_STORAGE_KEYS } from "@/features/tutorial/types";

/**
 * ボトムナビ。カタログ刷新(段階公開中は運営のみ)で次のように変わる。
 *  - ホームの右に「カタログ」(/styles)が加わる
 *  - 「コーディネート」が「つくる」になり、押すと毎回 Free Style を開く
 * 刷新前(一般の閲覧者)はこれまでどおり。
 */

const pushMock = jest.fn();
const prefetchMock = jest.fn();
const pathnameMock = jest.fn(() => "/ja");
jest.mock("next/navigation", () => ({
  usePathname: () => pathnameMock(),
  useRouter: () => ({ push: pushMock, prefetch: prefetchMock }),
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

const getCurrentUserMock = jest.fn(() =>
  Promise.resolve(null as { id: string } | null)
);
jest.mock("@/features/auth/lib/auth-client", () => ({
  getCurrentUser: () => getCurrentUserMock(),
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
  getCurrentUserMock.mockImplementation(() => Promise.resolve(null));
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
      setLastGenerationModePath("/free");
      const nav = await renderNav();

      fireEvent.click(nav.getByRole("button", { name: "コーディネート" }));

      expect(pushMock).toHaveBeenCalledWith("/ja/free");
    });

    test("前回が廃止した Coordinate なら Free Style を開く", async () => {
      // 廃止前にタブが保存した値
      window.localStorage.setItem(LAST_GENERATION_MODE_STORAGE_KEY, "/coordinate");
      const nav = await renderNav();

      fireEvent.click(nav.getByRole("button", { name: "コーディネート" }));

      expect(pushMock).toHaveBeenCalledTimes(1);
      expect(pushMock).toHaveBeenCalledWith("/ja/free");
    });

    test("ログイン中は /coordinate ではなく、転送先の /free を先読みする", async () => {
      getCurrentUserMock.mockImplementation(() =>
        Promise.resolve({ id: "user-1" })
      );
      await renderNav();

      const prefetched = prefetchMock.mock.calls.map(([href]) => href);
      expect(prefetched).toContain("/ja/style");
      // 入口の行き先(前回のモード)になりうる Free Style も、刷新前から先読みする
      expect(prefetched).toContain("/ja/free");
      expect(prefetched.filter((href) => href.includes("coordinate"))).toEqual(
        []
      );
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

    test("ログイン中はカタログと Free Style を先読みする", async () => {
      getCurrentUserMock.mockImplementation(() =>
        Promise.resolve({ id: "user-1" })
      );
      await renderNav();

      const prefetched = prefetchMock.mock.calls.map(([href]) => href);
      expect(prefetched).toContain("/ja/styles");
      expect(prefetched).toContain("/ja/free");
      expect(prefetched.filter((href) => href.includes("coordinate"))).toEqual(
        []
      );
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
