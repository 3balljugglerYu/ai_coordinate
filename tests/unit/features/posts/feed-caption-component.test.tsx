/**
 * フィードのキャプション表示のテスト。
 *
 * X 準拠の「1度目のタップで展開・2度目で詳細へ」を守れないと、
 * 読もうとしただけで別ページへ飛ばされる（逆に、展開しても詳細へ行けない）。
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { FeedCaption } from "@/features/posts/components/FeedCaption";

/** clientHeight / scrollHeight は JSDOM では常に 0。クランプの有無を差し込む。 */
function mockClamped(isClamped: boolean) {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get: () => (isClamped ? 200 : 50),
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => 50,
  });
}

describe("FeedCaption", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("本文が無ければ何も描画しない", () => {
    const { container } = render(
      <FeedCaption caption="" onOpenDetail={jest.fn()} expandLabel="もっと見る" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("連続改行を詰めて表示する", () => {
    mockClamped(false);
    render(
      <FeedCaption
        caption={"1行目\n\n\n\n2行目"}
        onOpenDetail={jest.fn()}
        expandLabel="もっと見る"
      />
    );
    expect(screen.getByTestId("feed-caption")).toHaveTextContent("1行目 2行目");
    expect(screen.getByTestId("feed-caption").textContent).toBe("1行目\n\n2行目");
  });

  test("5行に収まっていれば「もっと見る」を出さない", () => {
    mockClamped(false);
    render(
      <FeedCaption caption="短い本文" onOpenDetail={jest.fn()} expandLabel="もっと見る" />
    );
    expect(screen.queryByText("もっと見る")).not.toBeInTheDocument();
  });

  test("溢れていれば「もっと見る」を出し_1度目のタップで展開_2度目で詳細へ", () => {
    mockClamped(true);
    const onOpenDetail = jest.fn();
    render(
      <FeedCaption
        caption={"長い本文\n".repeat(20)}
        onOpenDetail={onOpenDetail}
        expandLabel="もっと見る"
      />
    );

    const caption = screen.getByTestId("feed-caption");
    expect(screen.getByText("もっと見る")).toBeInTheDocument();
    expect(caption).toHaveAttribute("data-expanded", "false");

    // 1度目: 展開するだけで遷移しない
    fireEvent.click(caption);
    expect(onOpenDetail).not.toHaveBeenCalled();
    expect(caption).toHaveAttribute("data-expanded", "true");
    expect(screen.queryByText("もっと見る")).not.toBeInTheDocument();

    // 2度目: 詳細へ
    fireEvent.click(caption);
    expect(onOpenDetail).toHaveBeenCalledTimes(1);
  });

  test("本文中のリンクは展開も遷移も起こさない", () => {
    mockClamped(true);
    const onOpenDetail = jest.fn();
    render(
      <FeedCaption
        caption="詳しくは https://example.com/ を見てね"
        onOpenDetail={onOpenDetail}
        expandLabel="もっと見る"
      />
    );

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://example.com/");
    fireEvent.click(link);

    expect(onOpenDetail).not.toHaveBeenCalled();
    expect(screen.getByTestId("feed-caption")).toHaveAttribute("data-expanded", "false");
  });

  test("キーボードでも展開できる", () => {
    mockClamped(true);
    const onOpenDetail = jest.fn();
    render(
      <FeedCaption
        caption={"長い本文\n".repeat(20)}
        onOpenDetail={onOpenDetail}
        expandLabel="もっと見る"
      />
    );

    const caption = screen.getByTestId("feed-caption");
    fireEvent.keyDown(caption, { key: "Enter" });
    expect(caption).toHaveAttribute("data-expanded", "true");
    fireEvent.keyDown(caption, { key: "Enter" });
    expect(onOpenDetail).toHaveBeenCalledTimes(1);
  });
});
