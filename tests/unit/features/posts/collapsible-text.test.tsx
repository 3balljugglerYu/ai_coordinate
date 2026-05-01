/** @jest-environment jsdom */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { CollapsibleText } from "@/features/posts/components/CollapsibleText";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

/**
 * jsdom では scrollHeight が常に 0 になるため、
 * line-clamp 判定 (`scrollHeight > lineHeight × maxLines`) を満たすには
 * scrollHeight を手動で大きい値に上書きする必要がある。
 */
function mockScrollHeight(value: number) {
  return jest
    .spyOn(HTMLElement.prototype, "scrollHeight", "get")
    .mockReturnValue(value);
}

describe("CollapsibleText", () => {
  describe("linkify オプション未指定時の回帰確認", () => {
    test("URLを含むテキストでも_aタグが描画されない_プレーンテキスト扱い", () => {
      render(
        <CollapsibleText
          text="see https://example.com here"
          maxLines={3}
        />
      );

      expect(
        screen.queryByRole("link", { name: /example\.com/ })
      ).toBeNull();
      expect(
        screen.getByText(/see https:\/\/example\.com here/)
      ).toBeInTheDocument();
    });
  });

  describe("linkify={true} のとき", () => {
    test("URL部分が_必須属性を持つaタグとして描画される", () => {
      render(
        <CollapsibleText
          text="see https://example.com"
          maxLines={3}
          linkify
        />
      );

      const anchor = screen.getByRole("link");
      expect(anchor).toHaveAttribute("href", "https://example.com/");
      expect(anchor).toHaveAttribute("target", "_blank");
      expect(anchor).toHaveAttribute("rel", "noopener noreferrer nofollow");
      expect(anchor).toHaveAttribute("title", "https://example.com");
      expect(anchor).toHaveTextContent("example.com");
    });

    test("URLを含まないテキストの場合_aタグは描画されず元の文字列がそのまま出る", () => {
      render(
        <CollapsibleText text="just plain text" maxLines={3} linkify />
      );

      expect(screen.queryByRole("link")).toBeNull();
      expect(screen.getByText("just plain text")).toBeInTheDocument();
    });
  });

  describe("inlineToggle のとき", () => {
    let scrollHeightSpy: jest.SpyInstance | null = null;

    afterEach(() => {
      scrollHeightSpy?.mockRestore();
      scrollHeightSpy = null;
    });

    test("トランケート対象のときインライン版「もっと見る」ボタンを描画する", () => {
      scrollHeightSpy = mockScrollHeight(9999);

      render(
        <CollapsibleText
          text={"long text\n".repeat(10)}
          maxLines={2}
          inlineToggle
        />,
      );

      const inlineButton = screen.getByRole("button", { name: /readMore/ });
      expect(inlineButton).toHaveTextContent("...readMore");
      expect(inlineButton).toHaveClass("absolute");
    });

    test("トランケートが不要なら「もっと見る」ボタンは描画しない", () => {
      scrollHeightSpy = mockScrollHeight(0);

      render(
        <CollapsibleText text="short" maxLines={3} inlineToggle />,
      );

      expect(screen.queryByRole("button")).toBeNull();
    });

    test("インラインボタンのクリック後は本文が展開され「折りたたむ」が出る", () => {
      scrollHeightSpy = mockScrollHeight(9999);

      render(
        <CollapsibleText
          text={"long text\n".repeat(10)}
          maxLines={2}
          inlineToggle
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /readMore/ }));

      expect(
        screen.getByRole("button", { name: /collapse/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /readMore/ }),
      ).not.toBeInTheDocument();
    });
  });

  describe("inlineToggle 未指定（既存挙動）のとき", () => {
    let scrollHeightSpy: jest.SpyInstance | null = null;

    afterEach(() => {
      scrollHeightSpy?.mockRestore();
      scrollHeightSpy = null;
    });

    test("トランケート対象でもインライン版ボタンは描画されず通常ボタンを使う", () => {
      scrollHeightSpy = mockScrollHeight(9999);

      render(
        <CollapsibleText
          text={"long text\n".repeat(10)}
          maxLines={2}
        />,
      );

      const button = screen.getByRole("button", { name: /readMore/ });
      expect(button).not.toHaveClass("absolute");
    });
  });
});
