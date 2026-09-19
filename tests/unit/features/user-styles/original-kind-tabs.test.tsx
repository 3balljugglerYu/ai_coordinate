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

beforeEach(() => jest.clearAllMocks());

describe("OriginalKindTabs", () => {
  test("2つのタブを常に両方出す（片方だけアイコンにしない）", () => {
    mockPathname.mockReturnValue("/ja/styles");
    render(<OriginalKindTabs publiclyEnabled />);

    expect(screen.getByText("userStyles.tabOfficial")).toBeInTheDocument();
    expect(screen.getByText("userStyles.tabUser")).toBeInTheDocument();
  });

  test.each([
    ["/ja/styles", "userStyles.tabOfficial"],
    ["/ja/user-styles", "userStyles.tabUser"],
  ])("%s ではそのタブに aria-selected が立つ", (pathname, label) => {
    mockPathname.mockReturnValue(pathname);
    render(<OriginalKindTabs publiclyEnabled />);

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
    render(<OriginalKindTabs publiclyEnabled />);

    const hrefs = screen.getAllByRole("tab").map((tab) => tab.getAttribute("href"));
    expect(hrefs).toEqual([`/${locale}/styles`, `/${locale}/user-styles`]);
  });

  test("ロケール無しのパスでもリンクは壊れない", () => {
    mockPathname.mockReturnValue("/user-styles");
    render(<OriginalKindTabs publiclyEnabled />);

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
      const { container } = render(<OriginalKindTabs publiclyEnabled />);

      expect(container).toBeEmptyDOMElement();
    }
  );

  /*
    ⭐ 公開前は /styles 側に出さない（存在を知らせない）。
    /user-styles 側は、到達できている時点で権限があるので出してよい。
  */
  test("公開前の /styles には出さない", () => {
    mockPathname.mockReturnValue("/ja/styles");
    const { container } = render(<OriginalKindTabs publiclyEnabled={false} />);

    expect(container).toBeEmptyDOMElement();
  });

  test("公開前でも /user-styles には出す（運営が戻れるように）", () => {
    mockPathname.mockReturnValue("/ja/user-styles");
    render(<OriginalKindTabs publiclyEnabled={false} />);

    expect(screen.getAllByRole("tab")).toHaveLength(2);
  });

  /*
    ⭐ タッチターゲットは最低 44x44px（project-conventions の Mobile-first ルール）。
  */
  test("タッチターゲットの高さを確保する", () => {
    mockPathname.mockReturnValue("/ja/styles");
    render(<OriginalKindTabs publiclyEnabled />);

    for (const tab of screen.getAllByRole("tab")) {
      expect(tab.className).toContain("min-h-[44px]");
    }
  });
});
