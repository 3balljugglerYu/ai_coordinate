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
  it("プロンプトの額は admin 設定値のまま表示する。スタイルの額は出さない(2026-10-05)", () => {
    render(
      <CreatorRewardsGuide
        promptUsageRewardAmount={1}
        styleUsageRewardAmount={3}
      />
    );
    expect(screen.getByText("+1")).toBeInTheDocument();
    // スタイルの還元は、受け取れるのが運営の登録した提供者だけなので、いったん出さない
    expect(screen.queryByText("+3")).toBeNull();
    expect(screen.getAllByText(/^現在の還元｜/)).toHaveLength(1);
    expect(screen.queryByText(/あなたのスタイルが使われたとき/)).toBeNull();
  });

  it("Style が 0(停止中)ならその行を出さない", () => {
    render(
      <CreatorRewardsGuide
        promptUsageRewardAmount={1}
        styleUsageRewardAmount={0}
      />
    );
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(screen.queryByText("+0")).toBeNull();
    // 停止中の分のカードは出さない
    expect(screen.getAllByText(/^現在の還元｜/)).toHaveLength(1);
    expect(screen.getByText("現在の還元｜あなたのプロンプトが使われたとき")).toBeTruthy();
  });

  it("プロンプトが 0(停止中)なら、その行とフォロワー説明を出さない", () => {
    render(
      <CreatorRewardsGuide
        promptUsageRewardAmount={0}
        styleUsageRewardAmount={2}
      />
    );
    // スタイルの額はいったん出さないので、額のカードは1枚も出ない
    expect(screen.queryByText("+2")).toBeNull();
    expect(screen.queryAllByText(/^現在の還元｜/)).toHaveLength(0);
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
    // CTA は上下2箇所。どちらも「カタログをつくる」(/free)へ(2026-10-05 に Free Style から改名)
    const ctas = screen.getAllByText("カタログをつくる →");
    expect(ctas).toHaveLength(2);
    for (const cta of ctas) {
      expect(cta.closest("a")).toHaveAttribute("href", "/free");
    }
  });

  // ⭐ 2026-10-05: 画面の名前を今の名前にそろえる(旧称 Free Style / 「このプロンプトで作る」を残さない)
  test("旧称(Free Style・このプロンプトで作る)を使わない", () => {
    const { container } = render(
      <CreatorRewardsGuide promptUsageRewardAmount={2} styleUsageRewardAmount={1} />
    );
    const text = container.textContent ?? "";
    expect(text).not.toContain("Free Style");
    expect(text).not.toContain("このプロンプトで作る");
    expect(text).toContain("このカタログで生成する");
  });

});
