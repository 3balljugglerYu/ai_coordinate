/** @jest-environment jsdom */

/**
 * 画面上部のタブが二重に出ないこと。
 *
 * /style・/free の上には、置き場所の違う2つの部品が重なる。
 *  - app/[locale]/layout.tsx の TopTabsSlot(刷新後の人のタブ)
 *  - (app)/layout.tsx の GeneralUserGenerationModeTabs(一般の利用者の生成モードのタブ)
 * どちらも同じ判定(useStylesCatalogRevamp)で出し分けるので、刷新の前後どちらでも、
 * 判定が false → true に変わったあと(運営への昇格)でも、タブは1つだけになる
 * (docs/planning/catalog-three-tabs-implementation-plan.md ADR-001)。
 *
 * 部品ごとのテストでは、この2つを重ねたときの数は確かめられないので、ここで重ねる。
 */

import React from "react";
import { render, screen } from "@testing-library/react";

const mockPathname = jest.fn<string, []>();
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}));

const mockRevamp = jest.fn<boolean, []>();
jest.mock("@/features/style-presets/hooks/useStylesCatalogRevamp", () => ({
  useStylesCatalogRevamp: () => mockRevamp(),
}));

// タブの中身は目印に置き換える。本物の GenerationModeTabs は /style・/free 以外では
// 自分で何も描かないので、このテストではその2画面だけを見る
jest.mock("@/components/GenerationModeTabs", () => ({
  GenerationModeTabs: () => <div data-testid="generation-mode-tabs" />,
}));
jest.mock("@/features/style-presets/components/OriginalKindTabs", () => ({
  OriginalKindTabs: () => <div data-testid="catalog-tabs" />,
}));

import { TopTabsSlot } from "@/components/TopTabsSlot";
import { GeneralUserGenerationModeTabs } from "@/components/GeneralUserGenerationModeTabs";

/** app/[locale]/layout.tsx の下に (app)/layout.tsx が入った形(上から並ぶ順) */
function StackedLayouts() {
  return (
    <>
      <TopTabsSlot />
      <GeneralUserGenerationModeTabs />
    </>
  );
}

/** 画面に出ているタブの種類を、上から順に */
function renderedTabs(): string[] {
  return Array.from(
    document.querySelectorAll(
      '[data-testid="generation-mode-tabs"], [data-testid="catalog-tabs"]'
    )
  ).map((node) =>
    node.getAttribute("data-testid") === "catalog-tabs" ? "catalog" : "generation"
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("画面上部のタブは1つだけ", () => {
  test.each<[boolean, string, string[]]>([
    // 一般の利用者は、/style・/free とも今までどおり生成モードのタブ
    [false, "/ja/style", ["generation"]],
    [false, "/ja/free", ["generation"]],
    // 刷新後は、/style は生成モードのタブのまま、/free はカタログのタブ
    [true, "/ja/style", ["generation"]],
    [true, "/ja/free", ["catalog"]],
  ])("刷新=%s・%s では %j", (revamp, pathname, expected) => {
    mockRevamp.mockReturnValue(revamp);
    mockPathname.mockReturnValue(pathname);

    render(<StackedLayouts />);

    expect(renderedTabs()).toEqual(expected);
  });

  /*
    ⭐ 公開前の運営は、最初は一般の利用者と同じ判定(false)で描かれ、画面が出たあとで
    true に昇格する。昇格の前と後のどちらでも、タブは1つずつ。
    (2つの部品は同じ判定を同じ描画の中で読むので、途中の状態は作らない作り。
    このテストが確かめるのは前と後の2つの状態)
  */
  test.each<[string, string[], string[]]>([
    ["/ja/style", ["generation"], ["generation"]],
    ["/ja/free", ["generation"], ["catalog"]],
  ])(
    "%s で運営に昇格しても(false → true)、タブは1つのまま(%j → %j)",
    (pathname, before, after) => {
      mockPathname.mockReturnValue(pathname);
      mockRevamp.mockReturnValue(false);
      const { rerender } = render(<StackedLayouts />);
      expect(renderedTabs()).toEqual(before);

      mockRevamp.mockReturnValue(true);
      rerender(<StackedLayouts />);

      expect(renderedTabs()).toEqual(after);
      expect(screen.queryAllByTestId(/tabs$/)).toHaveLength(1);
    }
  );
});
