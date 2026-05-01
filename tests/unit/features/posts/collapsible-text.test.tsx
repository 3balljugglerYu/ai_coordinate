/** @jest-environment jsdom */

import React from "react";
import { render, screen } from "@testing-library/react";
import { CollapsibleText } from "@/features/posts/components/CollapsibleText";

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

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
});
