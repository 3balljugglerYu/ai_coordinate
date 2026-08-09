/** @jest-environment jsdom */

/**
 * クリエイター還元 紹介ページ本体の表示テスト。
 *
 * 額は admin 設定由来で props から来る。文言に数字を埋め込んでいないこと
 * (= 運営が額を変えたら表示も変わること) と、停止中(0)の項目を出さないこと
 * を固定する。「もらえないのに もらえます と書かない」ための防波堤。
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { CreatorRewardsGuide } from "@/features/credits/components/CreatorRewardsGuide";

// Reveal(スクロール表示アニメ)が使う API は jsdom に無いため補う
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
  class MockIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (
    globalThis as unknown as { IntersectionObserver: unknown }
  ).IntersectionObserver = MockIntersectionObserver;
});

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt, src }: { alt?: string; src?: string }) =>
    React.createElement("img", { alt, src }),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href }, children),
}));

describe("CreatorRewardsGuide", () => {
  it("両方有効なら、それぞれの額が admin 設定値のまま表示される", () => {
    render(
      <CreatorRewardsGuide
        promptUsageRewardAmount={1}
        styleUsageRewardAmount={3}
      />
    );
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(screen.getByText("+3")).toBeInTheDocument();
    expect(
      screen.getByText("あなたのプロンプトが使われる")
    ).toBeInTheDocument();
    expect(
      screen.getByText("あなたの One-Tap Style が使われる")
    ).toBeInTheDocument();
  });

  it("Style が 0(停止中)ならその行を出さない", () => {
    render(
      <CreatorRewardsGuide
        promptUsageRewardAmount={1}
        styleUsageRewardAmount={0}
      />
    );
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(
      screen.queryByText("あなたの One-Tap Style が使われる")
    ).toBeNull();
  });

  it("プロンプトが 0(停止中)なら、その行とフォロワー説明を出さない", () => {
    render(
      <CreatorRewardsGuide
        promptUsageRewardAmount={0}
        styleUsageRewardAmount={2}
      />
    );
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.queryByText("あなたのプロンプトが使われる")).toBeNull();
    // フォロワー限定の説明は /free のプロンプト還元に固有の話なので出さない
    expect(
      screen.queryByText("フォロワーが増えるほど、使われる")
    ).toBeNull();
  });

  it("還元されないケースと CTA は常に出る", () => {
    render(
      <CreatorRewardsGuide
        promptUsageRewardAmount={1}
        styleUsageRewardAmount={0}
      />
    );
    expect(screen.getByText("還元されないケース")).toBeInTheDocument();
    expect(
      screen.getByText("自分で自分のプロンプトを使ったとき")
    ).toBeInTheDocument();
    expect(
      screen.getByText("じゆうモードで作る").closest("a")
    ).toHaveAttribute("href", "/free");
  });
});
