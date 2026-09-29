/** @jest-environment jsdom */

/**
 * 画面上部のタブの「置き場所」の配線。
 *
 * 部品ごとのテストだけでは、どの layout がどの部品を出すかは確かめられない。
 * ここを間違えると、一般の利用者にカタログのタブや2つ目の h1 が出てしまう
 * (一般の利用者には一般公開の日まで見た目を変えない約束。
 * docs/planning/catalog-three-tabs-implementation-plan.md)。
 */

import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("@/components/TopTabsSlot", () => ({
  TopTabsSlot: () => <div data-testid="top-tabs-slot" />,
}));
jest.mock("@/components/GeneralUserGenerationModeTabs", () => ({
  GeneralUserGenerationModeTabs: () => (
    <div data-testid="general-user-generation-mode-tabs" />
  ),
}));
jest.mock("@/components/GenerationModeTabs", () => ({
  GenerationModeTabs: () => <div data-testid="generation-mode-tabs-direct" />,
}));
jest.mock("@/features/style-presets/components/OriginalKindTabs", () => ({
  OriginalKindTabs: () => <div data-testid="catalog-tabs-direct" />,
}));

const mockFreePageHeader = jest.fn((props: Record<string, string>) => (
  <div data-testid="free-page-header">{props.title}</div>
));
jest.mock("@/features/generation/components/FreePageHeader", () => ({
  FreePageHeader: (props: Record<string, string>) => mockFreePageHeader(props),
}));
jest.mock("@/features/generation/components/FreePageBody", () => ({
  FreePageBody: () => <div data-testid="free-page-body" />,
}));

jest.mock("next-intl/server", () => ({
  setRequestLocale: jest.fn(),
  getLocale: async () => "ja",
  // getTranslations("free") と getTranslations({ locale, namespace: "free" }) の両方の書き方を受ける
  getTranslations: async (arg: string | { namespace?: string }) => {
    const namespace = typeof arg === "string" ? arg : arg?.namespace;
    return (key: string) => `${namespace}.${key}`;
  },
}));
jest.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
}));

import LocaleLayout from "@/app/[locale]/layout";
import AppGroupLayout from "@/app/(app)/layout";
import StylesCatalogLayout from "@/app/(styles-catalog)/layout";
import FreePage, { generateMetadata } from "@/app/(app)/free/page";

const CHILD = <div data-testid="child" />;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("タブの置き場所", () => {
  test("app/[locale]/layout は、ページの上にタブの入れ物を置く", async () => {
    const element = await LocaleLayout({
      children: CHILD,
      params: Promise.resolve({ locale: "ja" }),
    });
    const { container } = render(<>{element}</>);

    const slot = screen.getByTestId("top-tabs-slot");
    const child = screen.getByTestId("child");
    expect(container.firstElementChild).toBe(slot);
    expect(
      slot.compareDocumentPosition(child) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  /*
    ⭐ 一般の利用者の生成モードのタブは、一般公開の日まで今の置き場所から出す。
    ただし刷新後の人には出さない部品(GeneralUserGenerationModeTabs)を通す。
  */
  test("(app)/layout は、一般の利用者用の生成モードのタブを出す", () => {
    render(<AppGroupLayout>{CHILD}</AppGroupLayout>);

    expect(screen.getByTestId("general-user-generation-mode-tabs")).toBeTruthy();
    expect(screen.queryByTestId("generation-mode-tabs-direct")).toBeNull();
    expect(screen.getByTestId("child")).toBeTruthy();
  });

  /*
    ⭐ カタログのタブは入れ物(TopTabsSlot)から出す。ここにも残すと、
    /styles・/user-styles でタブと h1 が2つずつになる。
  */
  test("(styles-catalog)/layout は、カタログのタブを自分では出さない", () => {
    render(<StylesCatalogLayout>{CHILD}</StylesCatalogLayout>);

    expect(screen.queryByTestId("catalog-tabs-direct")).toBeNull();
    expect(screen.getByTestId("child")).toBeTruthy();
  });

  test("Free Style のページは、見出しの文言を FreePageHeader に渡す", async () => {
    const element = await FreePage();
    render(element);

    expect(mockFreePageHeader).toHaveBeenCalled();
    expect(mockFreePageHeader.mock.calls[0][0]).toEqual({
      title: "free.pageTitle",
      description: "free.pageDescription",
      catalogListed: "free.catalogCreateListed",
      catalogFollowers: "free.catalogCreateFollowers",
      catalogReward: "free.catalogCreateReward",
    });
    expect(screen.getByTestId("free-page-body")).toBeTruthy();
  });

  /*
    ⭐ 刷新後の /free は h1 をタブの上の見出し(「カタログをつくる」)に譲るが、ページの <title> と
    説明文は Free Style のまま。検索結果の見え方は変えない
    (docs/planning/catalog-three-tabs-implementation-plan.md Phase 2 の実装時の決定)。
  */
  test("Free Style のページの <title> と説明文は free.pageTitle / free.pageDescription のまま", async () => {
    const metadata = await generateMetadata();

    expect(metadata.title).toBe("free.pageTitle");
    expect(metadata.description).toBe("free.pageDescription");
  });
});
