/** @jest-environment jsdom */

/**
 * Free Style（/free）の上部の見出し。
 *
 * ⭐ 一般の利用者には、今の見出しと**まったく同じ HTML**を出す（一般公開の日まで
 * 見た目を変えない。docs/planning/catalog-three-tabs-implementation-plan.md）。
 *
 * カタログ刷新（公開前は運営だけ）では、/free は「カタログをつくる」のタブになる。
 *  - h1 はタブの上のカタログのタイトルが持つので、ここでは出さない（1ページに h1 は1つ）
 *  - つくって投稿すると「みんなのカタログ」に並ぶこと、フォロワーが使えること、
 *    還元があること（還元額が 0 のときは言わない）を伝える
 */

import React from "react";
// jsdom の環境では "react-dom/server" がブラウザ向けの版になり、読み込むだけで
// MessageChannel / TextEncoder を要求して落ちる。Node 向けの版を明示して使う
import { renderToString } from "react-dom/server.node";
import { hydrateRoot, type Root } from "react-dom/client";
import { act, render, screen } from "@testing-library/react";

const mockRevamp = jest.fn<boolean, []>();
jest.mock("@/features/style-presets/hooks/useStylesCatalogRevamp", () => ({
  useStylesCatalogRevamp: () => mockRevamp(),
}));

const mockRewardAmounts = jest.fn(() => ({
  promptUsageRewardAmount: 2,
  styleUsageRewardAmount: 2,
}));
jest.mock("@/features/credits/hooks/useUsageRewardAmounts", () => ({
  useUsageRewardAmounts: () => mockRewardAmounts(),
}));

import { FreePageHeader } from "@/features/generation/components/FreePageHeader";

const COPY = {
  title: "Free Style",
  description: "画像をアップロードして、自由な指示で思いのままに。",
  catalogListed: "CATALOG_LISTED",
  catalogFollowers: "CATALOG_FOLLOWERS",
  catalogReward: "CATALOG_REWARD",
};

beforeEach(() => {
  jest.clearAllMocks();
  // mockReturnValue は clearAllMocks で消えないので、既定値をテストごとに入れ直す
  mockRewardAmounts.mockReturnValue({
    promptUsageRewardAmount: 2,
    styleUsageRewardAmount: 2,
  });
});

describe("FreePageHeader", () => {
  describe("刷新前(一般の利用者)", () => {
    beforeEach(() => {
      mockRevamp.mockReturnValue(false);
    });

    test("今の見出しとまったく同じ HTML を出す", () => {
      const { container } = render(<FreePageHeader {...COPY} />);

      expect(container.innerHTML).toBe(
        '<div class="mb-6"><h1 class="text-3xl font-bold text-gray-900">Free Style</h1>' +
          '<p class="mt-2 text-sm text-gray-600">画像をアップロードして、自由な指示で思いのままに。</p></div>'
      );
    });

    test("還元額を取りに行かない(一般の利用者の通信を増やさない)", () => {
      render(<FreePageHeader {...COPY} />);

      expect(mockRewardAmounts).not.toHaveBeenCalled();
    });
  });

  describe("刷新後(運営)", () => {
    beforeEach(() => {
      mockRevamp.mockReturnValue(true);
    });

    test("h1 は出さず(カタログのタイトルが持つ)、説明とカタログに並ぶ条件・フォロワーのことを出す", () => {
      render(<FreePageHeader {...COPY} />);

      expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
      expect(screen.queryByText("Free Style")).toBeNull();
      expect(screen.getByText(COPY.description)).toBeTruthy();
      expect(screen.getByText("CATALOG_LISTED")).toBeTruthy();
      expect(screen.getByText("CATALOG_FOLLOWERS")).toBeTruthy();
    });

    test("還元額が 0 より大きいときは、還元の一文を出す", () => {
      mockRewardAmounts.mockReturnValue({
        promptUsageRewardAmount: 2,
        styleUsageRewardAmount: 0,
      });
      render(<FreePageHeader {...COPY} />);

      expect(screen.getByText("CATALOG_REWARD")).toBeTruthy();
    });

    /*
      ⭐ 還元は運営が 0(停止)にできる。停止中に「還元されます」と言わない。
      取得前・取得失敗のときも 0 が返る(useUsageRewardAmounts)。
    */
    test("還元額が 0 なら、還元の一文は出さない", () => {
      mockRewardAmounts.mockReturnValue({
        promptUsageRewardAmount: 0,
        styleUsageRewardAmount: 2,
      });
      render(<FreePageHeader {...COPY} />);

      expect(screen.queryByText("CATALOG_REWARD")).toBeNull();
      expect(screen.getByText("CATALOG_LISTED")).toBeTruthy();
    });

    /*
      ⭐ 還元額はモジュール変数にキャッシュされる。サーバーの HTML は常に 0 で描かれるが、
      ブラウザでは先に動いた部品(PostProgressHost)がもう取ってきていることがある。
      そのまま出すと HTML が食い違うので、還元の一文はハイドレーションのあとにだけ出す。
    */
    describe("サーバーで描いた HTML からのハイドレーション", () => {
      let container: HTMLDivElement | null = null;
      let root: Root | null = null;

      afterEach(() => {
        act(() => {
          root?.unmount();
        });
        container?.remove();
        container = null;
        root = null;
      });

      test("サーバーの HTML には、還元額があっても還元の一文を入れない", () => {
        mockRewardAmounts.mockReturnValue({
          promptUsageRewardAmount: 2,
          styleUsageRewardAmount: 2,
        });

        const html = renderToString(<FreePageHeader {...COPY} />);

        expect(html).toContain("CATALOG_LISTED");
        expect(html).toContain("CATALOG_FOLLOWERS");
        expect(html).not.toContain("CATALOG_REWARD");
      });

      test("サーバーの HTML には還元の一文を入れず、ハイドレーションのあとに出す(食い違いなし)", async () => {
        // サーバー: 還元額はまだ無い(0)
        mockRewardAmounts.mockReturnValue({
          promptUsageRewardAmount: 0,
          styleUsageRewardAmount: 0,
        });
        const html = renderToString(<FreePageHeader {...COPY} />);
        expect(html).toContain("CATALOG_LISTED");
        expect(html).not.toContain("CATALOG_REWARD");

        // ブラウザ: ほかの部品がもう還元額を取ってきている
        mockRewardAmounts.mockReturnValue({
          promptUsageRewardAmount: 2,
          styleUsageRewardAmount: 2,
        });
        container = document.createElement("div");
        container.innerHTML = html;
        document.body.appendChild(container);
        const onRecoverableError = jest.fn();
        // 属性だけの食い違いは onRecoverableError ではなく console.error に出る
        const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

        try {
          await act(async () => {
            root = hydrateRoot(container!, <FreePageHeader {...COPY} />, {
              onRecoverableError,
            });
          });

          expect(onRecoverableError).not.toHaveBeenCalled();
          expect(consoleError).not.toHaveBeenCalled();
          expect(container.textContent).toContain("CATALOG_REWARD");
        } finally {
          consoleError.mockRestore();
        }
      });
    });
  });
});
