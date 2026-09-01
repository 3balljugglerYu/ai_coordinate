/**
 * 引用元ブロック（X の引用リポスト相当）のテスト。
 *
 * ここが誤ると (a) 少ない利用回数を晒して逆に投稿意欲を削ぐ、
 * (b) 原作の比率に引きずられてカードの高さがばらつく、
 * (c) 未公開プリセットへのリンクで 404 に飛ばす、のいずれかが起きる。
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { FeedSourceQuote } from "@/features/posts/components/FeedSourceQuote";
import { USAGE_COUNT_DISPLAY_MIN } from "@/features/posts/lib/constants";

jest.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) =>
    values ? `${namespace}.${key}:${JSON.stringify(values)}` : `${namespace}.${key}`,
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href, ...props }, children),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt, src, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) =>
    React.createElement("img", { alt, src, ...props }),
}));

describe("FeedSourceQuote", () => {
  test("サムネイルは比率にかかわらず正方形にする", () => {
    render(
      <FeedSourceQuote variant="derived" thumbnailUrl="https://example.test/a.png" title="みきふく" />
    );

    const frame = screen.getByTestId("feed-source-quote-thumbnail");
    expect(frame.style.width).toBe(frame.style.height);
    expect(frame.querySelector("img")?.className).toContain("object-cover");
  });

  describe("利用回数", () => {
    test("下限に届かない回数は出さない(「使われていない」証明になるため)", () => {
      render(
        <FeedSourceQuote
          variant="derived"
          thumbnailUrl={null}
          title="みきふく"
          usageCount={USAGE_COUNT_DISPLAY_MIN - 1}
        />
      );
      expect(screen.queryByText(/UsageCount/)).not.toBeInTheDocument();
    });

    test("下限に届いたら出す", () => {
      render(
        <FeedSourceQuote
          variant="derived"
          thumbnailUrl={null}
          title="みきふく"
          usageCount={USAGE_COUNT_DISPLAY_MIN}
        />
      );
      expect(
        screen.getByText(
          `posts.sourcePromptUsageCount:{"count":${USAGE_COUNT_DISPLAY_MIN}}`
        )
      ).toBeInTheDocument();
    });

    /*
      文言が「◯回以上」なので、渡すのは必ず切り捨てた値。
      8 回を「10回以上」と出したら表示が嘘になる。
    */
    test("回数は切り捨てて丸めた値を文言に渡す", () => {
      render(
        <FeedSourceQuote
          variant="derived"
          thumbnailUrl={null}
          title="みきふく"
          usageCount={8}
        />
      );
      expect(
        screen.getByText('posts.sourcePromptUsageCount:{"count":5}')
      ).toBeInTheDocument();
    });

    test("スタイル向けは /style と同じ文言を使う(同じ意味の文言を2箇所で持たない)", () => {
      render(
        <FeedSourceQuote
          variant="style"
          thumbnailUrl={null}
          title="夏のマリンコーデ"
          usageCount={42}
        />
      );
      expect(
        screen.getByText('style.styleUsageCount:{"count":40}')
      ).toBeInTheDocument();
    });

    test("0回でも出さない", () => {
      render(<FeedSourceQuote variant="derived" thumbnailUrl={null} title="みきふく" usageCount={0} />);
      expect(screen.queryByText(/UsageCount/)).not.toBeInTheDocument();
    });
  });

  describe("リンク", () => {
    test("href があればリンクにする", () => {
      render(
        <FeedSourceQuote variant="derived" thumbnailUrl={null} title="みきふく" href="/posts/origin-1" />
      );
      expect(screen.getByTestId("feed-source-quote-link")).toHaveAttribute(
        "href",
        "/posts/origin-1"
      );
    });

    test("href が無ければリンクにしない(未公開プリセット等で404に飛ばさない)", () => {
      render(<FeedSourceQuote variant="style" thumbnailUrl={null} title="夏のマリンコーデ" href={null} />);
      expect(screen.queryByTestId("feed-source-quote-link")).not.toBeInTheDocument();
      expect(screen.getByText("夏のマリンコーデ")).toBeInTheDocument();
    });
  });

  test("説明とアクションを渡せば描画する", () => {
    render(
      <FeedSourceQuote
        variant="derived"
        thumbnailUrl={null}
        title="みきふく"
        description="赤白ボーダーのマリンコーデ"
        action={<button type="button">つくる</button>}
      />
    );
    expect(screen.getByText("赤白ボーダーのマリンコーデ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "つくる" })).toBeInTheDocument();
  });

  test("説明が無ければ行ごと出さない(高さを無駄に取らない)", () => {
    const { container } = render(
      <FeedSourceQuote variant="derived" thumbnailUrl={null} title="みきふく" />
    );
    expect(container.querySelectorAll("p")).toHaveLength(1); // 見出しのみ
  });

  describe("root(投稿自身のプロンプトが公開されている場合)", () => {
    test("サムネイルも作者アイコンも出さず_説明文で誰の何かを伝える", () => {
      /*
        原作＝この投稿なので、サムネイルと作者名はすぐ上の投稿本体と同じものになる。
        繰り返すと情報量ゼロで寂しく見えるため、説明文に置き換える。
      */
      render(<FeedSourceQuote variant="root" title="八月公" />);

      expect(screen.queryByTestId("feed-source-quote-thumbnail")).not.toBeInTheDocument();
      expect(screen.getByText("posts.feedQuoteRootTitle")).toBeInTheDocument();
      expect(
        screen.getByText('posts.feedQuoteRootDescription:{"name":"八月公"}')
      ).toBeInTheDocument();
    });

    test("自分自身へのリンクは張らない", () => {
      render(<FeedSourceQuote variant="root" title="八月公" href="/posts/self" />);
      expect(screen.queryByTestId("feed-source-quote-link")).not.toBeInTheDocument();
    });
  });

  describe("終了した企画", () => {
    test("会期が終わっていたら理由を出す（無反応のカードにしない）", () => {
      render(
        <FeedSourceQuote variant="style" title="8枚目｜エンディング・裏表紙" isEnded />
      );

      expect(screen.getByTestId("feed-source-quote-ended")).toHaveTextContent(
        "posts.feedQuoteEndedNote"
      );
      // リンク先が無いので押せないままでよい。理由が出ていることが要件
      expect(screen.queryByTestId("feed-source-quote-link")).not.toBeInTheDocument();
    });

    test("終了の案内は利用回数より優先する（もう使えないため）", () => {
      render(
        <FeedSourceQuote
          variant="style"
          title="8枚目｜エンディング・裏表紙"
          usageCount={9999}
          isEnded
        />
      );

      expect(screen.getByTestId("feed-source-quote-ended")).toBeInTheDocument();
      expect(screen.queryByText(/styleUsageCount/)).not.toBeInTheDocument();
    });

    test("開催中は従来どおり利用回数を出す", () => {
      render(
        <FeedSourceQuote
          variant="style"
          title="夏のマリンコーデ"
          href="/styles/summer-marine"
          usageCount={9999}
        />
      );

      expect(screen.queryByTestId("feed-source-quote-ended")).not.toBeInTheDocument();
      expect(screen.getByTestId("feed-source-quote-link")).toBeInTheDocument();
    });
  });

  test("見出しは種類ごとに変わる", () => {
    const { rerender } = render(<FeedSourceQuote variant="derived" title="みきふく" />);
    expect(screen.getByText("posts.feedQuoteDerivedTitle")).toBeInTheDocument();

    rerender(<FeedSourceQuote variant="style" title="夏のマリンコーデ" />);
    expect(screen.getByText("posts.feedQuoteStyleTitle")).toBeInTheDocument();
  });
});
