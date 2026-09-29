/**
 * カタログのタブ（ペルスタのカタログ / みんなのカタログ / カタログをつくる）。
 *
 * ⭐ このコンポーネントは **layout に置く前提**（今は app/[locale]/layout.tsx の
 * TopTabsSlot から出す）。ページの中に置くと遷移のたびに remount され、ピルが
 * スライドせず瞬間移動する（一度それで「UX として最悪」と指摘を受けた）。
 * そのため現在地は props ではなく `usePathname()` から決める。
 *
 * 出すかどうか（段階公開中は運営だけ）は TopTabsSlot が決める。ここは
 * 「今どの画面か」だけを見る。
 */

import React from "react";
import { act, render, screen, within } from "@testing-library/react";
import { OriginalKindTabs } from "@/features/style-presets/components/OriginalKindTabs";

// 翻訳関数は名前空間ごとに同じものを返す。タブは選択中のタブを測ってピルを動かし、
// 翻訳関数を測り直しの依存に入れる(言語を切り替えたら測り直す)。毎回作り直すと
// 測り直しが止まらなくなる(generation-mode-tabs.test.tsx と同じ)
const mockTranslators = new Map<string, (key: string) => string>();
jest.mock("next-intl", () => ({
  useTranslations: (namespace: string) => {
    let translate = mockTranslators.get(namespace);
    if (!translate) {
      translate = (key: string) => `${namespace}.${key}`;
      mockTranslators.set(namespace, translate);
    }
    return translate;
  },
}));

const mockPathname = jest.fn<string, []>();
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}));

// 運営かどうか(段階公開)の判定は TopTabsSlot の仕事。ここは見ないことを確かめるため、
// あえて「運営ではない」にしておく
const mockAvailable = jest.fn(() => false);
jest.mock("@/features/user-styles/components/UserStylesAvailabilityProvider", () => ({
  useUserStylesAvailable: () => mockAvailable(),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: React.forwardRef<
    HTMLAnchorElement,
    { href: string; children: React.ReactNode; prefetch?: boolean }
  >(function MockLink({ href, children, prefetch, ...props }, ref) {
    // prefetch は Link 固有の prop。DOM へ渡すと React が警告するので捨てる。
    void prefetch;
    return React.createElement("a", { href, ref, ...props }, children);
  }),
}));

const TITLES = [
  "userStyles.tabOfficialTitle",
  "userStyles.tabUserTitle",
  "userStyles.tabCreateTitle",
];
const SUBTITLES = [
  "userStyles.tabOfficial",
  "userStyles.tabUser",
  "userStyles.tabCreate",
];

beforeEach(() => {
  jest.clearAllMocks();
});

describe("OriginalKindTabs", () => {
  test("出すかどうか(運営かどうか)は判定しない。/styles でも運営の判定を待たずに出す", () => {
    mockPathname.mockReturnValue("/ja/styles");
    render(<OriginalKindTabs />);

    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  test("タブは3つで、ペルスタのカタログ・みんなのカタログ・カタログをつくるの順", () => {
    mockPathname.mockReturnValue("/ja/styles");
    render(<OriginalKindTabs />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.getAttribute("aria-label"))).toEqual(TITLES);
    expect(tabs.map((tab) => tab.getAttribute("href"))).toEqual([
      "/ja/styles",
      "/ja/user-styles",
      "/ja/free",
    ]);
  });

  /*
    ⭐ 3つ並べると、スマホでは名前が入りきらない。今の生成モードのタブと同じく、
    選んでいるタブだけ名前（見出し＋英語）を出し、ほかはアイコンだけにする。
    名前は読み上げ用に残す（aria-label と sr-only）。
  */
  test.each([
    ["/ja/styles", 0],
    ["/ja/user-styles", 1],
    ["/ja/free", 2],
  ])(
    "%s では選んでいるタブだけ見出しと英語を出し、ほかはアイコンだけにする",
    (pathname, activeIndex) => {
      mockPathname.mockReturnValue(pathname);
      render(<OriginalKindTabs />);

      const tabs = screen.getAllByRole("tab");
      expect(tabs).toHaveLength(3);
      tabs.forEach((tab, index) => {
        expect(tab.querySelector("svg")).not.toBeNull();
        const title = within(tab).getByText(TITLES[index]);
        if (index === activeIndex) {
          expect(tab.getAttribute("aria-selected")).toBe("true");
          expect(tab.getAttribute("aria-current")).toBe("page");
          expect(title.className).not.toContain("sr-only");
          expect(within(tab).getByText(SUBTITLES[index])).toBeTruthy();
        } else {
          expect(tab.getAttribute("aria-selected")).toBe("false");
          expect(title.className).toContain("sr-only");
          expect(within(tab).queryByText(SUBTITLES[index])).toBeNull();
        }
      });
    }
  );

  test.each(["/ja/styles", "/ja/user-styles", "/ja/free"])(
    "%s ではタブの上にカタログのタイトル(h1)を出す",
    (pathname) => {
      mockPathname.mockReturnValue(pathname);
      render(<OriginalKindTabs />);

      expect(
        screen.getByRole("heading", { level: 1, name: "userStyles.catalogTitle" })
      ).toBeTruthy();
    }
  );

  /*
    ⭐ ロケールを落とすと、押した瞬間に言語が既定へ戻る。
    layout に置いた以上、ロケールは props ではなく pathname から拾うしかない。
  */
  test.each(["ja", "en", "ko"])("リンク先に %s のロケールを引き継ぐ", (locale) => {
    mockPathname.mockReturnValue(`/${locale}/free`);
    render(<OriginalKindTabs />);

    const hrefs = screen.getAllByRole("tab").map((tab) => tab.getAttribute("href"));
    expect(hrefs).toEqual([
      `/${locale}/styles`,
      `/${locale}/user-styles`,
      `/${locale}/free`,
    ]);
  });

  test("ロケール無しのパスでもリンクは壊れない", () => {
    mockPathname.mockReturnValue("/user-styles");
    render(<OriginalKindTabs />);

    const hrefs = screen.getAllByRole("tab").map((tab) => tab.getAttribute("href"));
    expect(hrefs).toEqual(["/styles", "/user-styles", "/free"]);
  });

  /*
    ⭐ スタイル紹介ページ(/styles/[slug])にタブを出すと「一覧の切替」という
    意味が壊れる。/style(One-Tap の画面)もカタログのタブではない。
  */
  test.each(["/ja/styles/some-slug", "/ja/style", "/ja/posts/abc", "/"])(
    "%s では出さない",
    (pathname) => {
      mockPathname.mockReturnValue(pathname);
      const { container } = render(<OriginalKindTabs />);

      expect(container).toBeEmptyDOMElement();
    }
  );

  /*
    ⭐ タッチターゲットは最低 44x44px（project-conventions の Mobile-first ルール）。
    アイコンだけのタブも同じ。
  */
  test("タッチターゲットの高さと幅を確保する", () => {
    mockPathname.mockReturnValue("/ja/styles");
    render(<OriginalKindTabs />);

    for (const tab of screen.getAllByRole("tab")) {
      expect(tab.className).toContain("min-h-[44px]");
      expect(tab.className).toContain("min-w-[44px]");
    }
  });

  /*
    初回の描画ではピルをスライドさせない(左端から滑ってくる不自然な動きを防ぐ)。
    次のフレームからは、タブを切り替えるとスライドする。
  */
  test("ピルは初回の描画ではスライドさせず、次のフレームからスライドする", async () => {
    mockPathname.mockReturnValue("/ja/styles");
    const { container, rerender } = render(<OriginalKindTabs />);
    const pill = () =>
      container.querySelector('[role="tablist"] > span[aria-hidden]');

    expect(pill()).not.toBeNull();
    expect(pill()!.className).not.toContain("transition-[left,width]");

    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });

    expect(pill()!.className).toContain("transition-[left,width]");

    // 切り替えた直後(次のフレームを待たない)もスライドする
    mockPathname.mockReturnValue("/ja/free");
    rerender(<OriginalKindTabs />);

    expect(pill()!.className).toContain("transition-[left,width]");
  });
});
