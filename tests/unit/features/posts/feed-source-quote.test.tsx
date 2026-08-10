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
import { USAGE_COUNT_DISPLAY_THRESHOLD } from "@/features/posts/lib/constants";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
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
      <FeedSourceQuote thumbnailUrl="https://example.test/a.png" title="みきふく" />
    );

    const frame = screen.getByTestId("feed-source-quote-thumbnail");
    expect(frame.style.width).toBe(frame.style.height);
    expect(frame.querySelector("img")?.className).toContain("object-cover");
  });

  describe("利用回数", () => {
    test("下限に届かない回数は出さない(「使われていない」証明になるため)", () => {
      render(
        <FeedSourceQuote
          thumbnailUrl={null}
          title="みきふく"
          usageCount={USAGE_COUNT_DISPLAY_THRESHOLD - 1}
        />
      );
      expect(screen.queryByText(/sourcePromptUsageCount/)).not.toBeInTheDocument();
    });

    test("下限に届いたら出す", () => {
      render(
        <FeedSourceQuote
          thumbnailUrl={null}
          title="みきふく"
          usageCount={USAGE_COUNT_DISPLAY_THRESHOLD}
        />
      );
      expect(
        screen.getByText(`sourcePromptUsageCount:{"count":${USAGE_COUNT_DISPLAY_THRESHOLD}}`)
      ).toBeInTheDocument();
    });

    test("0回でも出さない", () => {
      render(<FeedSourceQuote thumbnailUrl={null} title="みきふく" usageCount={0} />);
      expect(screen.queryByText(/sourcePromptUsageCount/)).not.toBeInTheDocument();
    });
  });

  describe("リンク", () => {
    test("href があればリンクにする", () => {
      render(
        <FeedSourceQuote thumbnailUrl={null} title="みきふく" href="/posts/origin-1" />
      );
      expect(screen.getByTestId("feed-source-quote-link")).toHaveAttribute(
        "href",
        "/posts/origin-1"
      );
    });

    test("href が無ければリンクにしない(未公開プリセット等で404に飛ばさない)", () => {
      render(<FeedSourceQuote thumbnailUrl={null} title="夏のマリンコーデ" href={null} />);
      expect(screen.queryByTestId("feed-source-quote-link")).not.toBeInTheDocument();
      expect(screen.getByText("夏のマリンコーデ")).toBeInTheDocument();
    });
  });

  test("説明とアクションを渡せば描画する", () => {
    render(
      <FeedSourceQuote
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
      <FeedSourceQuote thumbnailUrl={null} title="みきふく" />
    );
    expect(container.querySelectorAll("p")).toHaveLength(1); // 見出しラベルのみ
  });
});
