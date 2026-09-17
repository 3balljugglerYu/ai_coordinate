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

  test("アクションを渡せば描画する", () => {
    render(
      <FeedSourceQuote
        variant="derived"
        thumbnailUrl={null}
        title="みきふく"
        action={<button type="button">つくる</button>}
      />
    );
    expect(screen.getByRole("button", { name: "つくる" })).toBeInTheDocument();
  });

  describe("derived(他人のプロンプトで生成した投稿)", () => {
    test("⭐「プロンプト作成者」はアイコンの上に置く(名前の横だと飾りになる)", () => {
      render(
        <FeedSourceQuote
          variant="derived"
          thumbnailUrl="https://example.test/a.png"
          title="みきふく"
          avatarUrl="https://example.test/avatar.png"
        />
      );

      const label = screen.getByText("posts.feedQuotePromptCreator");
      const avatar = screen.getByTestId("feed-source-quote-avatar");
      expect(screen.getByText("みきふく")).toBeInTheDocument();

      /*
        ラベルがアイコンより前に来ていること。DOCUMENT_POSITION_FOLLOWING は
        「引数のノードが自分より後ろ」を表すので、label から見て avatar が後ろ。
      */
      expect(label.compareDocumentPosition(avatar) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING
      );
    });

    test("⭐原作のキャプションは出さない(切り詰められて意味が取れず_誰が作ったかをぼかす)", () => {
      const { container } = render(
        <FeedSourceQuote
          variant="derived"
          thumbnailUrl="https://example.test/a.png"
          title="みきふく"
          avatarUrl="https://example.test/avatar.png"
          usageCount={USAGE_COUNT_DISPLAY_MIN}
        />
      );

      /*
        出てよい <p> は見出しと利用回数の2つだけ。キャプションの行が戻ると増える。
        （作成者ラベルとニックネームは <span> なのでここには数えない）
      */
      expect(container.querySelectorAll("p")).toHaveLength(2);
    });

    test("⭐作成者アイコンは名前の高さに留める(root の 40px にしない)", () => {
      /*
        ここはサムネイルが figure の役を担うので、アイコンは名前に添える小さいもの。
        40px にするとサムネイルと合わせて右の幅が 200px ほどしか残らず、
        利用回数が「…利用されまし / た」と2行に折り返す。
      */
      render(<FeedSourceQuote variant="derived" thumbnailUrl={null} title="みきふく" />);

      expect(screen.getByTestId("feed-source-quote-avatar")).toHaveStyle({
        width: "20px",
        height: "20px",
      });
    });
  });

  describe("root(投稿自身のプロンプトが公開されている場合)", () => {
    test("⭐サムネイルは出さない(原作＝この投稿なので上の本体と同じ画像になる)", () => {
      render(
        <FeedSourceQuote variant="root" title="八月公" thumbnailUrl="https://example.test/a.png" />
      );

      // thumbnailUrl を渡しても描画しない。root で出すのは顔（アイコン）だけ
      expect(screen.queryByTestId("feed-source-quote-thumbnail")).not.toBeInTheDocument();
      expect(screen.getByText("posts.feedQuotePromptCreator")).toBeInTheDocument();
    });

    test("作者アイコンとニックネームを出す", () => {
      render(
        <FeedSourceQuote
          variant="root"
          title="八月公"
          avatarUrl="https://example.test/avatar.png"
        />
      );

      expect(screen.getByTestId("feed-source-quote-avatar")).toHaveAttribute(
        "src",
        "https://example.test/avatar.png"
      );
      expect(screen.getByText("八月公")).toBeInTheDocument();
    });

    test("アイコン未設定でも枠が欠けない(人型のプレースホルダを出す)", () => {
      render(<FeedSourceQuote variant="root" title="八月公" />);

      expect(screen.getByTestId("feed-source-quote-avatar")).toBeInTheDocument();
    });

    test("⭐アイコンはニックネームと利用回数の2行分の大きさにする", () => {
      /*
        root にはサムネイルが無く、ここが唯一の図像になる。引用行と同じ 20px だと
        「作成者」の主張が弱い。大きさが変わるとレイアウトの意図が崩れるので固定する。
      */
      render(<FeedSourceQuote variant="root" title="八月公" />);

      const avatar = screen.getByTestId("feed-source-quote-avatar");
      expect(avatar).toHaveStyle({ width: "40px", height: "40px" });
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

  describe("見出し(出どころのクレジット)", () => {
    /*
      結果物の2種が「〜しました」で揃っていて見分けられない、という指摘への対応。
      見出しは手順ではなく「誰のものか」を出す。root だけは招待なので据え置き
      （文の形が違うこと自体が見分けの手がかりになる）。
    */
    test("種類ごとに変わる", () => {
      const { rerender } = render(<FeedSourceQuote variant="derived" title="みきふく" />);
      expect(screen.getByText("posts.feedQuoteDerivedTitle")).toBeInTheDocument();

      rerender(<FeedSourceQuote variant="style" title="夏のマリンコーデ" />);
      expect(screen.getByText("posts.feedQuoteStyleTitle")).toBeInTheDocument();
    });

    test("⭐derived の見出しに作者名を入れない(名前行と重複するため)", () => {
      /*
        見出しを `ORIGINAL by {name}` にしたところ、すぐ下の名前行と隣接して
        同じ名前が2回並び、明らかに冗長だった。名前を出す役目は名前行が持つ
        （そちらはリンクの実体で、押すと原作の投稿へ飛ぶ）。

        ⭐ 翻訳のモックは値を `key:{"name":"みきふく"}` の1文字列として描画するので、
        `getAllByText("みきふく")` の完全一致では見出しの名前を検出できない。
        見出しを名指しで見ること。
      */
      render(<FeedSourceQuote variant="derived" title="みきふく" />);

      expect(screen.getByTestId("feed-source-quote-heading").textContent).not.toContain(
        "みきふく"
      );
    });
  });
});
