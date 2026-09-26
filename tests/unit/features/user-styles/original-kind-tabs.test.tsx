/**
 * Persta.AI ORIGINAL ⇄ User ORIGINAL のトグル。
 *
 * ⭐ このコンポーネントは **layout に置く前提**。ページの中に置くと遷移のたびに
 * remount され、ピルがスライドせず瞬間移動する（一度それで「UX として最悪」と
 * 指摘を受けた）。そのため現在地は props ではなく `usePathname()` から決める
 * ── layout はどのページが下にいるかを知らないため。
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { OriginalKindTabs } from "@/features/style-presets/components/OriginalKindTabs";

jest.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

const mockPathname = jest.fn<string, []>();
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}));

const mockAvailable = jest.fn<boolean, []>();
jest.mock("@/features/user-styles/components/UserStylesAvailabilityProvider", () => ({
  useUserStylesAvailable: () => mockAvailable(),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    prefetch,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    prefetch?: boolean;
  }) => {
    // prefetch は Link 固有の prop。DOM へ渡すと React が警告するので捨てる。
    void prefetch;
    return React.createElement("a", { href, ...props }, children);
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockAvailable.mockReturnValue(true);
});

describe("OriginalKindTabs", () => {
  test("2つのタブを常に両方出す（片方だけアイコンにしない）", () => {
    mockPathname.mockReturnValue("/ja/styles");
    render(<OriginalKindTabs />);

    expect(screen.getByText("userStyles.tabOfficial")).toBeInTheDocument();
    expect(screen.getByText("userStyles.tabUser")).toBeInTheDocument();
  });

  test.each(["/ja/styles", "/ja/user-styles"])(
    "%s ではタブの上にカタログのタイトル(h1)を出す",
    (pathname) => {
      mockPathname.mockReturnValue(pathname);
      render(<OriginalKindTabs />);

      expect(
        screen.getByRole("heading", { level: 1, name: "userStyles.catalogTitle" }),
      ).toBeTruthy();
    },
  );

  test.each([
    ["/ja/styles", "userStyles.tabOfficial"],
    ["/ja/user-styles", "userStyles.tabUser"],
  ])("%s ではそのタブに aria-selected が立つ", (pathname, label) => {
    mockPathname.mockReturnValue(pathname);
    render(<OriginalKindTabs />);

    const selected = screen
      .getAllByRole("tab")
      .filter((tab) => tab.getAttribute("aria-selected") === "true");
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent(label);
  });

  /*
    ⭐ ロケールを落とすと、押した瞬間に言語が既定へ戻る。
    layout に置いた以上、ロケールは props ではなく pathname から拾うしかない。
  */
  test.each(["ja", "en", "ko"])("リンク先に %s のロケールを引き継ぐ", (locale) => {
    mockPathname.mockReturnValue(`/${locale}/user-styles`);
    render(<OriginalKindTabs />);

    const hrefs = screen.getAllByRole("tab").map((tab) => tab.getAttribute("href"));
    expect(hrefs).toEqual([`/${locale}/styles`, `/${locale}/user-styles`]);
  });

  test("ロケール無しのパスでもリンクは壊れない", () => {
    mockPathname.mockReturnValue("/user-styles");
    render(<OriginalKindTabs />);

    const hrefs = screen.getAllByRole("tab").map((tab) => tab.getAttribute("href"));
    expect(hrefs).toEqual(["/styles", "/user-styles"]);
  });

  /*
    ⭐ layout 配下にはスタイル紹介ページ(/styles/[slug])も入る。
    そこにトグルを出すと「一覧の切替」という意味が壊れる。
  */
  test.each(["/ja/styles/some-slug", "/ja/posts/abc", "/"])(
    "%s では出さない",
    (pathname) => {
      mockPathname.mockReturnValue(pathname);
      const { container } = render(<OriginalKindTabs />);

      expect(container).toBeEmptyDOMElement();
    }
  );

  /*
    ⭐ 公開前は /styles 側に出さない（存在を知らせない）。
    /user-styles 側は、到達できている時点で権限があるので出してよい。
  */
  test("運営と判定される前の /styles には出さない", () => {
    mockPathname.mockReturnValue("/ja/styles");
    mockAvailable.mockReturnValue(false);
    const { container } = render(<OriginalKindTabs />);

    expect(container).toBeEmptyDOMElement();
  });

  /*
    ⭐ /user-styles は**到達できている時点で権限がある**ので昇格を待たない。
    待たせると、運営にだけトグルが遅れて現れてガタつく。
  */
  test("/user-styles では昇格を待たずに出す", () => {
    mockPathname.mockReturnValue("/ja/user-styles");
    mockAvailable.mockReturnValue(false);
    render(<OriginalKindTabs />);

    expect(screen.getAllByRole("tab")).toHaveLength(2);
  });

  /*
    ⭐ タッチターゲットは最低 44x44px（project-conventions の Mobile-first ルール）。
  */
  test("タッチターゲットの高さを確保する", () => {
    mockPathname.mockReturnValue("/ja/styles");
    render(<OriginalKindTabs />);

    for (const tab of screen.getAllByRole("tab")) {
      expect(tab.className).toContain("min-h-[44px]");
    }
  });
});
