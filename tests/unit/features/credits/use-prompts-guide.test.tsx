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
import { render, screen, fireEvent } from "@testing-library/react";
import { UsePromptsGuide } from "@/features/credits/components/UsePromptsGuide";

const setHomeViewModeMock = jest.fn();
const routerPushMock = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => routerPushMock(...args) }),
}));

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
    renderGuide({ promptUseBonusAmount: 15, freePostBonusAmount: 7 });

    // 額を出すのはヒーローの額カードだけ
    expect(screen.getAllByText("+15")).toHaveLength(1);
  });

  /**
   * ⭐ 額は本文に書かない。伝えたいのは「作った人にも届く」ことであって
   * 金額ではない。数字を書くと、変えたときにこのページだけが古い額を
   * 言い続ける(額の正本は `percoin_bonus_defaults`)。
   */
  test("⭐還元の案内に金額を書かない", () => {
    renderGuide({ creatorRewardAmount: 3 });

    expect(screen.getByText("原作者にも、届きます")).toBeInTheDocument();
    expect(
      screen.getByText(/ペルコインが還元されます/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/\+3/)).not.toBeInTheDocument();
  });

  test("還元が停止中(0)なら、原作者に届く案内を出さない", () => {
    renderGuide({ creatorRewardAmount: 0 });

    expect(screen.queryByText("原作者にも、届きます")).not.toBeInTheDocument();
    // 残りの2つは還元と無関係なので出続ける
    expect(
      screen.getByText("「原作 ◯◯さん」が必ず付きます")
    ).toBeInTheDocument();
  });

  test("案内できるミッションが1つも無ければ、セクションごと出さない", () => {
    renderGuide({
      freePostBonusAmount: 0,
      oneTapPostBonusAmount: 0,
      creatorRewardAmount: 0,
    });

    expect(screen.queryByText("ほかにも、")).not.toBeInTheDocument();
  });

  /**
   * ⭐ 「ほかにも、もらえます」に**額は書かない**。
   *
   * 額は今後下げていく見込みで、大きく出すほど下げたときに
   * 「取り上げられた」と受け取られる。伝えたいのは「もらえる機会が
   * ほかにもある」ことで、金額ではない。
   */
  test("⭐ほかのミッションの案内に額を書かない", () => {
    renderGuide({
      promptUseBonusAmount: 20,
      freePostBonusAmount: 15,
      oneTapPostBonusAmount: 12,
    });

    expect(screen.getByText("自分で書いて投稿する")).toBeInTheDocument();
    expect(screen.queryByText("+15")).not.toBeInTheDocument();
    expect(screen.queryByText("+12")).not.toBeInTheDocument();
    // 合計も出さない
    expect(screen.queryByText("+35")).not.toBeInTheDocument();
  });

  /**
   * ⭐ 額は出さないが**見る**。0 は停止中なので、もらえないミッションへ
   * 案内してしまわないよう、その行ごと落とす。
   */
  test("⭐停止中(0)のミッションは案内しない", () => {
    renderGuide({ freePostBonusAmount: 0, oneTapPostBonusAmount: 0 });

    expect(screen.queryByText("自分で書いて投稿する")).not.toBeInTheDocument();
    expect(
      screen.queryByText("One-Tap Style で投稿する")
    ).not.toBeInTheDocument();
  });

  test("案内は各ミッションのページへ送る", () => {
    renderGuide({ freePostBonusAmount: 20, oneTapPostBonusAmount: 20 });

    expect(
      screen.getByRole("link", { name: /自分で書いて投稿する/ })
    ).toHaveAttribute("href", "/free");
    expect(
      screen.getByRole("link", { name: /One-Tap Style で投稿する/ })
    ).toHaveAttribute("href", "/style");
    expect(
      screen.getByRole("link", { name: /あなたのプロンプトが使われる/ })
    ).toHaveAttribute("href", "/creator-rewards");
  });

  test("額の正本としてミッション画面へ案内する", () => {
    renderGuide({ freePostBonusAmount: 20 });

    expect(
      screen.getByRole("link", { name: "ミッション画面" })
    ).toHaveAttribute("href", "/challenge");
  });

  /**
   * ⭐ 額のセクションを畳んでも、この事実は消さないこと。
   * 1投稿で両方もらえると誤解されると、そのまま問い合わせになる
   * (付与RPC は派生投稿をフリー投稿ボーナスから明示的に除外している)。
   */
  test("⭐1投稿はどちらか一方であることを明示する", () => {
    renderGuide();

    expect(
      screen.getByText(/1つの投稿でもらえるのは、どちらか一方です/)
    ).toBeInTheDocument();
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

    /**
     * ⭐ 並べ方の条件は、ページ本文と `getUsablePromptShowcase` の絞り込みで
     * **対**になっている。片方だけ変えると、書いてある基準と実際の並びが
     * 食い違う。
     *
     * 「運営が選んでいるわけではない」とは書かない。条件と「自動で」だけで
     * 足りるという判断で、わざわざ否定を置く方がかえって身構えさせる。
     */
    test("⭐どういう基準で並んでいるかを書く", () => {
      renderGuide({ showcase });

      const note = screen
        .getByText(/新しい順に自動で/)
        .closest("p") as HTMLElement;

      expect(note).toHaveTextContent("Free Style で投稿され");
      expect(note).toHaveTextContent("Before / After が載っている作品");
      expect(note).toHaveTextContent("新しい投稿があれば入れ替わります");
      // 否定は置かない
      expect(note).not.toHaveTextContent("運営が選んで");
    });

    /**
     * ⭐ 説明はサムネイルの**下**。
     *
     * 見出しのすぐ下に置くと、肝心の作品にたどり着く前に説明を読ませる。
     * この文が要るのは、並んでいるものを見て「なぜ自分のが載っているのか」と
     * 思った人で、その人はもうサムネイルを見たあとにいる。
     */
    test("⭐説明はサムネイルより後ろに置く", () => {
      renderGuide({ showcase });

      const note = screen
        .getByText(/新しい順に自動で/)
        .closest("p") as HTMLElement;
      const thumb = screen.getAllByRole("link", { name: /みきふく/ })[0];

      // DOCUMENT_POSITION_FOLLOWING = 4 (note が thumb より後ろ)
      expect(
        thumb.compareDocumentPosition(note) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    });

    test("実データが無ければセクションごと出さない", () => {
      renderGuide({ showcase: [] });

      expect(
        screen.queryByText("使えるプロンプト")
      ).not.toBeInTheDocument();
    });

    /**
     * ⭐ ここは読み物の途中にある。押した先は投稿の詳細で、戻ってこないと
     * 続きが読めない。黙って飛ばすと、どこまで読んだか分からなくなる。
     */
    describe("サムネイルを押したとき", () => {
      test("⭐すぐには移動せず、確認を出す", () => {
        renderGuide({ showcase });

        fireEvent.click(screen.getAllByRole("link", { name: /みきふく/ })[0]);

        expect(
          screen.getByText("この作品のページへ移動しますか？")
        ).toBeInTheDocument();
        expect(routerPushMock).not.toHaveBeenCalled();
      });

      test("「作品を見る」で投稿ページへ送る", () => {
        renderGuide({ showcase });
        fireEvent.click(screen.getAllByRole("link", { name: /みきふく/ })[0]);

        fireEvent.click(screen.getByRole("button", { name: "作品を見る" }));

        expect(routerPushMock).toHaveBeenCalledWith("/posts/post-1");
      });

      /**
       * ⭐ クライアント遷移では、戻ったときにこのページの状態がそのまま
       * 復元される。開いたままにすると**戻ってきた瞬間にモーダルが被さり**、
       * 読んでいた場所が塞がれる(実機で確認して見つけた)。
       */
      test("⭐送り出す前に閉じる（戻ったときに被らない）", () => {
        renderGuide({ showcase });
        fireEvent.click(screen.getAllByRole("link", { name: /みきふく/ })[0]);

        fireEvent.click(screen.getByRole("button", { name: "作品を見る" }));

        expect(
          screen.queryByText("この作品のページへ移動しますか？")
        ).not.toBeInTheDocument();
      });

      test("「このページに戻る」で閉じ、移動しない", () => {
        renderGuide({ showcase });
        fireEvent.click(screen.getAllByRole("link", { name: /みきふく/ })[0]);

        fireEvent.click(
          screen.getByRole("button", { name: "このページに戻る" })
        );

        expect(
          screen.queryByText("この作品のページへ移動しますか？")
        ).not.toBeInTheDocument();
        expect(routerPushMock).not.toHaveBeenCalled();
      });
    });
  });
});
