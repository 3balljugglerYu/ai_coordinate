/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { FeedCaption } from "@/features/posts/components/FeedCaption";
import { CollapsibleText } from "@/features/posts/components/CollapsibleText";
import {
  SearchAvailabilityProvider,
  SearchAvailabilityUpgrade,
} from "@/features/posts/components/SearchAvailabilityProvider";

// next-intl は ESM のままなので、他のコンポーネントテストと同じくモックする
jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({ readMore: "もっと見る", collapse: "閉じる" })[key] ?? key,
}));

/**
 * @param available true なら「運営として検索が開いている」状態を再現する
 */
function renderWithAvailability(
  ui: React.ReactElement,
  { available }: { available: boolean }
) {
  return render(
    <SearchAvailabilityProvider>
      {ui}
      {available ? <SearchAvailabilityUpgrade /> : null}
    </SearchAvailabilityProvider>
  );
}

describe("キャプションのハッシュタグ表示", () => {
  describe("FeedCaption", () => {
    test("検索が開いていればタグが検索へのリンクになる", () => {
      renderWithAvailability(
        <FeedCaption
          caption="今日は #冬服 です"
          onOpenDetail={jest.fn()}
          expandLabel="もっと見る"
        />,
        { available: true }
      );

      const link = screen.getByRole("link", { name: "#冬服" });
      expect(link).toHaveAttribute(
        "href",
        `/search?q=${encodeURIComponent("#冬服")}`
      );
    });

    test("段階公開中はリンクにしない（遷移先が閉じているため）", () => {
      renderWithAvailability(
        <FeedCaption
          caption="今日は #冬服 です"
          onOpenDetail={jest.fn()}
          expandLabel="もっと見る"
        />,
        { available: false }
      );

      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      expect(screen.getByTestId("feed-caption")).toHaveTextContent(
        "今日は #冬服 です"
      );
    });

    test("大文字小文字は書かれたまま遷移先に載せる", () => {
      renderWithAvailability(
        <FeedCaption
          caption="#PerstaAI で作りました"
          onOpenDetail={jest.fn()}
          expandLabel="もっと見る"
        />,
        { available: true }
      );

      expect(screen.getByRole("link", { name: "#PerstaAI" })).toHaveAttribute(
        "href",
        `/search?q=${encodeURIComponent("#PerstaAI")}`
      );
    });

    test("URL リンクは従来どおり出す", () => {
      renderWithAvailability(
        <FeedCaption
          caption="https://example.com/a #冬服"
          onOpenDetail={jest.fn()}
          expandLabel="もっと見る"
        />,
        { available: true }
      );

      expect(screen.getByRole("link", { name: "example.com/a" })).toHaveAttribute(
        "href",
        "https://example.com/a"
      );
      expect(screen.getByRole("link", { name: "#冬服" })).toBeInTheDocument();
    });

    test("タグとして成立しない書き方はリンクにしない", () => {
      renderWithAvailability(
        <FeedCaption
          caption="#冬服#みきふく"
          onOpenDetail={jest.fn()}
          expandLabel="もっと見る"
        />,
        { available: true }
      );

      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });
  });

  describe("CollapsibleText", () => {
    test("linkifyHashtags を渡した呼び出しだけタグをリンクにする", () => {
      renderWithAvailability(
        <CollapsibleText text="#冬服 の記録" maxLines={3} linkify linkifyHashtags />,
        { available: true }
      );

      expect(screen.getByRole("link", { name: "#冬服" })).toBeInTheDocument();
    });

    test("プロフィール文・コメントではリンクにしない（既定 false）", () => {
      // タグを保存も検索もしていない場所で青くすると、押しても何も出てこない
      renderWithAvailability(
        <CollapsibleText text="#冬服 が好きです" maxLines={3} linkify />,
        { available: true }
      );

      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    test("段階公開中は linkifyHashtags を渡してもリンクにしない", () => {
      renderWithAvailability(
        <CollapsibleText text="#冬服 の記録" maxLines={3} linkify linkifyHashtags />,
        { available: false }
      );

      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });
  });
});
