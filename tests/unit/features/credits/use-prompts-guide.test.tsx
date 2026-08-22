/** @jest-environment jsdom */

/**
 * プロンプト利用ミッション 紹介ページ本体の表示テスト。
 *
 * 額は admin 設定由来で props から来る。文言に数字を埋め込んでいないこと
 * (= 運営が額を変えたら表示も変わること)と、停止中(0)の項目を出さないことを固定する。
 *
 * あわせて**文言と付与RPCの一致**も固定する。フォローが必要なこと、
 * 1投稿はフリー投稿ボーナスと排他であること、コピペが対象外であることは、
 * 抜けると問い合わせに直結するので、消えたらテストが落ちるようにしておく。
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { UsePromptsGuide } from "@/features/credits/components/UsePromptsGuide";

const setHomeViewModeMock = jest.fn();

jest.mock("@/features/posts/lib/home-view-preference", () => ({
  setHomeViewMode: (...args: unknown[]) => setHomeViewModeMock(...args),
}));

// PopIn(スクロール表示アニメ)が使う API は jsdom に無いため補う
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
  default: ({
    href,
    children,
    onClick,
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: () => void;
  }) => React.createElement("a", { href, onClick }, children),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

/** 既定は「すべて稼働中」。テストごとに必要な分だけ上書きする。 */
function renderGuide(props: Partial<React.ComponentProps<typeof UsePromptsGuide>> = {}) {
  return render(
    <UsePromptsGuide
      promptUseBonusAmount={20}
      freePostBonusAmount={20}
      creatorRewardAmount={2}
      {...props}
    />
  );
}

describe("UsePromptsGuide", () => {
  test("付与額は props のまま表示される（文言に埋め込まない）", () => {
    // 比較セクションにも同じ額が出るので、フリー投稿側とは別の数にして識別する
    renderGuide({ promptUseBonusAmount: 15, freePostBonusAmount: 7 });

    // ヒーローの額カードと、比較セクションの行の2箇所に出る
    expect(screen.getAllByText("+15")).toHaveLength(2);
    expect(screen.getByText("+7")).toBeInTheDocument();
  });

  test("還元額も props のまま本文に出る", () => {
    renderGuide({ creatorRewardAmount: 3 });

    expect(
      screen.getByText(/\+3 ペルコインが還元されます/)
    ).toBeInTheDocument();
  });

  test("還元が停止中(0)なら、原作者に届く案内を出さない", () => {
    renderGuide({ creatorRewardAmount: 0 });

    expect(screen.queryByText("原作者にも、届きます")).not.toBeInTheDocument();
    // 残りの2つは還元と無関係なので出続ける
    expect(
      screen.getByText("「原作 ◯◯さん」が必ず付きます")
    ).toBeInTheDocument();
  });

  test("フリー投稿ボーナスが停止中なら、比較のセクションごと出さない", () => {
    renderGuide({ freePostBonusAmount: 0 });

    expect(screen.queryByText("自分で書いて投稿")).not.toBeInTheDocument();
  });

  test("1日に両方やったときの合計を、2つの額の和として出す", () => {
    renderGuide({ promptUseBonusAmount: 20, freePostBonusAmount: 15 });

    expect(screen.getByText("+35")).toBeInTheDocument();
  });

  test("1投稿はどちらか一方であることを明示する", () => {
    renderGuide();

    expect(screen.getByText("どちらか一方")).toBeInTheDocument();
  });

  test("フォローが必要であることを手順に書く", () => {
    renderGuide();

    expect(screen.getByText("フォローして、生成する")).toBeInTheDocument();
    expect(
      screen.getByText(/フォローしている人だけです/)
    ).toBeInTheDocument();
  });

  test("もらえないケースを、付与RPCの分岐どおり並べる", () => {
    renderGuide();

    for (const title of [
      "自分のプロンプトを使ったとき",
      "プロンプトをコピーして貼り付けたとき",
      "生成しただけで、投稿していないとき",
      "前の日につくった作品を投稿したとき",
      "その日すでに受け取っているとき",
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  test("停止中を運営が見ているときだけ、準備中バナーを出す", () => {
    const { unmount } = renderGuide({ isPreview: true });
    expect(
      screen.getByText("準備中：このページは運営にだけ見えています")
    ).toBeInTheDocument();
    unmount();

    renderGuide({ isPreview: false });
    expect(
      screen.queryByText("準備中：このページは運営にだけ見えています")
    ).not.toBeInTheDocument();
  });

  test("額を仮置きしている下見では、仮の額であることを明記する", () => {
    renderGuide({ isPreview: true, previewAmount: 20, promptUseBonusAmount: 20 });

    // 「もう 20 になっている」と読まれると、実施済みかの判断を誤る
    expect(
      screen.getByText(/下見用の仮の額です/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/実際の設定は 0（停止中）のまま/)
    ).toBeInTheDocument();
  });

  test("仮置きしていない下見では、下見のしかたを案内する", () => {
    renderGuide({ isPreview: true, previewAmount: null });

    expect(screen.getByText(/\?amount=20 で下見できます/)).toBeInTheDocument();
    expect(screen.queryByText(/下見用の仮の額です/)).not.toBeInTheDocument();
  });

  test("ホームへの導線は、押すとフィード表示へ切り替えてから遷移する", () => {
    renderGuide();

    const links = screen.getAllByText("プロンプトをさがす →");
    expect(links.length).toBeGreaterThan(0);
    links[0].click();

    // グリッド表示のままだと「このプロンプトで生成する」が見えない
    expect(setHomeViewModeMock).toHaveBeenCalledWith("feed");
  });

  describe("フォローすると使えるプロンプト", () => {
    const showcase = [
      {
        postId: "post-1",
        thumbnailUrl: "https://example.test/a.webp",
        authorName: "みきふく",
        usageCount: 12,
      },
      {
        postId: "post-2",
        thumbnailUrl: "https://example.test/b.webp",
        authorName: "ちゃんりお",
        usageCount: null,
      },
    ];

    test("実データがあれば、投稿ページへのリンクとして並べる", () => {
      renderGuide({ showcase });

      expect(screen.getByText("みきふく")).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /みきふく/ })
      ).toHaveAttribute("href", "/posts/post-1");
    });

    test("利用回数は閾値を満たしたものだけ出る（null は出さない）", () => {
      renderGuide({ showcase });

      expect(screen.getByText("12回使われました")).toBeInTheDocument();
      expect(screen.queryByText("0回使われました")).not.toBeInTheDocument();
    });

    test("実データが無ければセクションごと出さない", () => {
      renderGuide({ showcase: [] });

      expect(
        screen.queryByText("使えるプロンプト")
      ).not.toBeInTheDocument();
    });
  });
});
