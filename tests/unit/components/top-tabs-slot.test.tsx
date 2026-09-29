/** @jest-environment jsdom */

/**
 * 画面上部のタブの入れ物（app/[locale]/layout.tsx に置く）。
 *
 * ⭐ カタログ刷新（公開前は運営だけ）の人にだけタブを出す。一般の利用者には
 * 何も描かない ── 一般の利用者のタブは、一般公開の日まで今の置き場所
 * （(app)/layout.tsx）から出す。見た目もコードの通り道も変えないため
 * （docs/planning/catalog-three-tabs-implementation-plan.md ADR-001）。
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

// 作り直された回数を数える(3つのタブのあいだを移っても、作り直さないことを確かめる)
let mockCatalogTabsMounts = 0;
jest.mock("@/features/style-presets/components/OriginalKindTabs", () => {
  // jest.mock の中では外の import を使えないので、ここで読み込む
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require("react");
  return {
    OriginalKindTabs: function MockOriginalKindTabs() {
      useEffect(() => {
        mockCatalogTabsMounts += 1;
      }, []);
      return <div data-testid="catalog-tabs" />;
    },
  };
});

jest.mock("@/components/GenerationModeTabs", () => ({
  GenerationModeTabs: () => <div data-testid="generation-mode-tabs" />,
}));

import { TopTabsSlot } from "@/components/TopTabsSlot";

beforeEach(() => {
  jest.clearAllMocks();
  mockCatalogTabsMounts = 0;
});

describe("TopTabsSlot", () => {
  describe("刷新後(運営)", () => {
    beforeEach(() => {
      mockRevamp.mockReturnValue(true);
    });

    test.each(["/ja/styles", "/ja/user-styles", "/ja/free", "/en/free"])(
      "%s ではカタログの3つのタブを出す",
      (pathname) => {
        mockPathname.mockReturnValue(pathname);
        render(<TopTabsSlot />);

        expect(screen.getByTestId("catalog-tabs")).toBeTruthy();
        expect(screen.queryByTestId("generation-mode-tabs")).toBeNull();
      }
    );

    /*
      ⭐ 入れ物を置く理由そのもの(REQ-03)。/free だけ別の包み方をすると、
      /user-styles → /free でタブが作り直され、ピルが滑らずに一度消える。
    */
    test("3つのタブのあいだを移っても、カタログのタブは作り直さない", () => {
      mockPathname.mockReturnValue("/ja/styles");
      const { rerender } = render(<TopTabsSlot />);

      mockPathname.mockReturnValue("/ja/user-styles");
      rerender(<TopTabsSlot />);
      mockPathname.mockReturnValue("/ja/free");
      rerender(<TopTabsSlot />);
      mockPathname.mockReturnValue("/ja/styles");
      rerender(<TopTabsSlot />);

      expect(screen.getByTestId("catalog-tabs")).toBeTruthy();
      expect(mockCatalogTabsMounts).toBe(1);
    });

    test("/style(One-Tap の画面)では生成モードのタブを出す", () => {
      mockPathname.mockReturnValue("/ja/style");
      render(<TopTabsSlot />);

      expect(screen.getByTestId("generation-mode-tabs")).toBeTruthy();
      expect(screen.queryByTestId("catalog-tabs")).toBeNull();
    });

    test.each(["/ja", "/ja/styles/paris-look", "/my-page", "/ja/posts/abc"])(
      "%s では何も出さない",
      (pathname) => {
        mockPathname.mockReturnValue(pathname);
        const { container } = render(<TopTabsSlot />);

        expect(container.innerHTML).toBe("");
      }
    );
  });

  describe("刷新前(一般の利用者)", () => {
    beforeEach(() => {
      mockRevamp.mockReturnValue(false);
    });

    test.each(["/ja/styles", "/ja/free", "/ja/style", "/ja", "/ja/styles/paris-look"])(
      "%s では空の要素も含めて何も描かない",
      (pathname) => {
        mockPathname.mockReturnValue(pathname);
        const { container } = render(<TopTabsSlot />);

        expect(container.innerHTML).toBe("");
      }
    );

    /*
      ⭐ 一般の利用者が /user-styles を開くと 404 になるが、404 に替わる前の HTML に
      タブが入ると、公開前の「カタログをつくる」まで見えてしまう。
      /user-styles でも判定を待ち、刷新前の人には何も描かない。
    */
    test("/user-styles でも何も描かない(404 に替わる前にタブを見せない)", () => {
      mockPathname.mockReturnValue("/ja/user-styles");
      const { container } = render(<TopTabsSlot />);

      expect(container.innerHTML).toBe("");
    });
  });
});
