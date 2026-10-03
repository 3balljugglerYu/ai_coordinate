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
 *  - 生成の入口を「カタログ」(/styles)1つにまとめる。「コーディネート」も「つくる」も出さない
 *  - Free Style はカタログの中の「カタログをつくる」タブになる
 *    (docs/planning/catalog-three-tabs-implementation-plan.md ADR-004)
 * 刷新前(一般の閲覧者)はこれまでどおり。見た目も動きも変えない。
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

    test("前回のモードの画面(/free)にいるときに「コーディネート」を押しても、どこへも行かない", async () => {
      setLastGenerationModePath("/free");
      pathnameMock.mockReturnValue("/ja/free");
      const nav = await renderNav();

      fireEvent.click(nav.getByRole("button", { name: "コーディネート" }));

      expect(pushMock).not.toHaveBeenCalled();
      for (const button of nav.getAllByRole("button")) {
        expect((button as HTMLButtonElement).disabled).toBe(false);
      }
    });

    test("/free にいても「コーディネート」は選択中にしない(これまでどおり)", async () => {
      pathnameMock.mockReturnValue("/ja/free");
      const nav = await renderNav();

      expect(
        nav.getByRole("button", { name: "コーディネート" }).className
      ).not.toContain("text-primary");
    });
  });

  describe("刷新前の見た目を変えない(一般の閲覧者)", () => {
    /*
      ⭐ ツアーの最初の一歩は、この目印の付いたボタンを指す(querySelector で最初の1つ)。
      刷新後に目印を「カタログ」へ移すとき、一般の閲覧者のナビまで変えると
      一般の閲覧者のツアーが止まる。
    */
    test("チュートリアルの目印は「コーディネート」に1つだけ付く", async () => {
      catalogRevampMock.mockReturnValue(false);
      const nav = await renderNav();

      expect(
        nav.getByRole("button", { name: "コーディネート" }).getAttribute("data-tour")
      ).toBe("coordinate-nav-mobile");
      expect(
        document.querySelectorAll('[data-tour="coordinate-nav-mobile"]')
      ).toHaveLength(1);
    });

    test("ボタンとラベルは今の形のまま(最小幅 60px・省略なし)", async () => {
      catalogRevampMock.mockReturnValue(false);
      const nav = await renderNav();

      const button = nav.getByRole("button", { name: "マイページ" });
      expect(button.className).toContain("min-w-[60px] px-2");
      expect(button.className).not.toContain("min-w-0");
      expect(within(button).getByText("マイページ").className).not.toContain(
        "truncate"
      );
    });
  });

  describe("刷新後(運営・公開後)", () => {
    beforeEach(() => {
      catalogRevampMock.mockReturnValue(true);
    });

    /*
      ⭐ 生成の入口は「カタログ」1つにまとめた(「つくる」は無い)。Free Style は
      カタログの中の「カタログをつくる」タブになる
      (docs/planning/catalog-three-tabs-implementation-plan.md ADR-004)。
    */
    test("ホームの右に「カタログ」を置いた5項目で、「つくる」は無い", async () => {
      const nav = await renderNav();

      expect(labels(nav.getAllByRole("button"))).toEqual([
        "ホーム",
        "カタログ",
        "ミッション",
        "お知らせ",
        "マイページ",
      ]);
      expect(nav.queryByRole("button", { name: "つくる" })).toBeNull();
    });

    test("チュートリアルの目印は「カタログ」に付ける(ツアーの最初の一歩が指す先)", async () => {
      const nav = await renderNav();

      expect(
        nav.getByRole("button", { name: "カタログ" }).getAttribute("data-tour")
      ).toBe("coordinate-nav-mobile");
      expect(
        document.querySelectorAll('[data-tour="coordinate-nav-mobile"]')
      ).toHaveLength(1);
    });

    test("「カタログ」はPerstaのカタログ(/styles)を開く", async () => {
      const nav = await renderNav();

      fireEvent.click(nav.getByRole("button", { name: "カタログ" }));

      expect(pushMock).toHaveBeenCalledWith("/ja/styles");
    });

    test("チュートリアルツアー中の「カタログ」は One-Tap Style を開く", async () => {
      window.sessionStorage.setItem(TUTORIAL_STORAGE_KEYS.IN_PROGRESS, "true");
      const nav = await renderNav();

      fireEvent.click(nav.getByRole("button", { name: "カタログ" }));

      expect(pushMock).toHaveBeenCalledWith("/ja/style");
    });

    // Perstaのカタログ(/styles)にいても、ツアー中の行き先は /style なので進む(ツアーを止めない)
    test("ツアー中はPerstaのカタログ(/styles)にいても、「カタログ」で One-Tap Style を開く", async () => {
      window.sessionStorage.setItem(TUTORIAL_STORAGE_KEYS.IN_PROGRESS, "true");
      pathnameMock.mockReturnValue("/ja/styles");
      const nav = await renderNav();

      fireEvent.click(nav.getByRole("button", { name: "カタログ" }));

      expect(pushMock).toHaveBeenCalledTimes(1);
      expect(pushMock).toHaveBeenCalledWith("/ja/style");
    });

    /*
      ⭐ 押したあと、行き先に着くまでボタンは押せない(二重に押させない)。行き先を
      /styles のまま覚えると、実際は /style に着くので解けず、10秒間どのボタンも
      押せなくなる。
    */
    test("ツアー中に「カタログ」で /style に着いたら、ボタンはまた押せる", async () => {
      window.sessionStorage.setItem(TUTORIAL_STORAGE_KEYS.IN_PROGRESS, "true");
      let rerender: (ui: React.ReactElement) => void = () => {};
      await act(async () => {
        ({ rerender } = render(<NavigationBar />));
      });
      const nav = within(screen.getByRole("navigation"));

      fireEvent.click(nav.getByRole("button", { name: "カタログ" }));
      pathnameMock.mockReturnValue("/ja/style");
      await act(async () => {
        rerender(<NavigationBar />);
      });

      for (const button of nav.getAllByRole("button")) {
        expect((button as HTMLButtonElement).disabled).toBe(false);
      }
    });

    test.each(["/ja/free", "/ja/style"])(
      "%s にいるときに「カタログ」を押すと、Perstaのカタログ(/styles)を開く",
      async (pathname) => {
        pathnameMock.mockReturnValue(pathname);
        const nav = await renderNav();

        fireEvent.click(nav.getByRole("button", { name: "カタログ" }));

        expect(pushMock).toHaveBeenCalledWith("/ja/styles");
      }
    );

    /*
      行き先(押したときに決め直したパス)が今の画面と同じなら、何もしない(push しない)。
      ツアー中の /style は、項目のパス(/styles)ではなく決め直した行き先(/style)で比べている
      ことを確かめる行。この行だけは、待ち状態(着くはずのない遷移を10秒待ってボタンが
      押せない)になっていないことも、ボタンの状態で確かめられる。
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
        pathnameMock.mockReturnValue(pathname);
        const nav = await renderNav();

        fireEvent.click(nav.getByRole("button", { name: "カタログ" }));

        expect(pushMock).not.toHaveBeenCalled();
        for (const button of nav.getAllByRole("button")) {
          expect((button as HTMLButtonElement).disabled).toBe(false);
        }
      }
    );

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

    test.each(["/ja/styles", "/ja/user-styles", "/ja/free", "/ja/style"])(
      "%s では「カタログ」を選択中にする",
      async (pathname) => {
        pathnameMock.mockReturnValue(pathname);
        const nav = await renderNav();

        const active = nav
          .getAllByRole("button")
          .filter((button) => button.className.includes("text-primary"))
          .map((button) => button.textContent);
        expect(active).toEqual(["カタログ"]);
      }
    );

    test("5項目なので、ボタンとラベルは刷新前とまったく同じ形で並べる", async () => {
      catalogRevampMock.mockReturnValue(false);
      let unmount: () => void = () => {};
      await act(async () => {
        ({ unmount } = render(<NavigationBar />));
      });
      const before = within(screen.getByRole("navigation")).getByRole("button", {
        name: "マイページ",
      });
      const beforeButtonClass = before.className;
      const beforeLabelClass = within(before).getByText("マイページ").className;
      unmount();

      catalogRevampMock.mockReturnValue(true);
      const nav = await renderNav();
      const after = nav.getByRole("button", { name: "マイページ" });

      expect(after.className).toBe(beforeButtonClass);
      expect(within(after).getByText("マイページ").className).toBe(beforeLabelClass);
    });
  });
});
