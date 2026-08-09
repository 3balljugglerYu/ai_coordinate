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
      screen.getByText(
        "あなたのプロンプトが使われる度に、ペルコインが付与されます"
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "あなたの One-Tap Style が使われる度に、ペルコインが付与されます"
      )
    ).toBeInTheDocument();
    // 「現在の還元」の見出しは有効な項目の数だけ出る
    expect(screen.getAllByText("現在の還元")).toHaveLength(2);
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
      screen.queryByText(
        "あなたの One-Tap Style が使われる度に、ペルコインが付与されます"
      )
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
    expect(
      screen.queryByText(
        "あなたのプロンプトが使われる度に、ペルコインが付与されます"
      )
    ).toBeNull();
    // フォロワー限定の説明は Free Style のプロンプト還元に固有の話なので出さない
    expect(screen.queryByText(/フォロワーが増えるほど/)).toBeNull();
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
    // CTA は上下2箇所。どちらも Free Style へ
    const ctas = screen.getAllByText("Free Style でつくる →");
    expect(ctas).toHaveLength(2);
    for (const cta of ctas) {
      expect(cta.closest("a")).toHaveAttribute("href", "/free");
    }
  });
});
