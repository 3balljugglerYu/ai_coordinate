/**
 * Persta.AI ORIGINAL ⇄ User ORIGINAL のトグル。
 *
 * ここが誤ると (a) 棚の名前とフィードのカードの名前が食い違う、
 * (b) ロケールを落として言語が切り替わる、のどちらかが起きる。
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { OriginalKindTabs } from "@/features/style-presets/components/OriginalKindTabs";

jest.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
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
    // prefetch は Link 固有の prop。DOM へ渡すと React が
    // 「non-boolean attribute」を警告するので、ここで捨てる。
    void prefetch;
    return React.createElement("a", { href, ...props }, children);
  },
}));

describe("OriginalKindTabs", () => {
  test("2つのタブを常に両方出す（片方だけアイコンにしない）", () => {
    render(<OriginalKindTabs active="official" locale="ja" />);

    expect(screen.getByText("userStyles.tabOfficial")).toBeInTheDocument();
    expect(screen.getByText("userStyles.tabUser")).toBeInTheDocument();
  });

  test.each([
    ["official", "userStyles.tabOfficial"],
    ["user", "userStyles.tabUser"],
  ] as const)("active=%s のタブに aria-selected が立つ", (active, label) => {
    render(<OriginalKindTabs active={active} locale="ja" />);

    const tabs = screen.getAllByRole("tab");
    const selected = tabs.filter(
      (tab) => tab.getAttribute("aria-selected") === "true"
    );
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent(label);
  });

  /*
    ⭐ ロケールを落とすと、押した瞬間に言語が既定へ戻る。
  */
  test.each(["en", "ja", "ko"] as const)(
    "リンク先に %s のロケールを付ける",
    (locale) => {
      render(<OriginalKindTabs active="user" locale={locale} />);

      const hrefs = screen
        .getAllByRole("tab")
        .map((tab) => tab.getAttribute("href"));
      expect(hrefs).toEqual([`/${locale}/styles`, `/${locale}/user-styles`]);
    }
  );

  /*
    ⭐ `/user-styles` が i18n/config.ts の PUBLIC_PATH_PATTERNS に無いと、
    localizePublicPath がロケールを付けずに返す。押した瞬間に言語が既定へ戻り、
    app/[locale]/user-styles の re-export ルートも使われなくなる。
  */
  test("/user-styles は公開パスとして登録されている", () => {
    render(<OriginalKindTabs active="official" locale="ko" />);

    const hrefs = screen
      .getAllByRole("tab")
      .map((tab) => tab.getAttribute("href"));
    expect(hrefs).toContain("/ko/user-styles");
  });

  /*
    ⭐ タッチターゲットは最低 44x44px（project-conventions の Mobile-first ルール）。
    /styles の既存チップ(py-1.5)を写すと足りない。
  */
  test("タッチターゲットの高さを確保する", () => {
    render(<OriginalKindTabs active="official" locale="ja" />);

    for (const tab of screen.getAllByRole("tab")) {
      expect(tab.className).toContain("min-h-[44px]");
    }
  });
});
