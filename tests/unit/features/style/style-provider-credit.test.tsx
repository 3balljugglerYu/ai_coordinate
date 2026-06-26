/** @jest-environment jsdom */

import type { MouseEventHandler, ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { StyleProviderCredit } from "@/features/style/components/StyleProviderCredit";

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href,
    onClick,
    "aria-label": ariaLabel,
  }: {
    children: ReactNode;
    href: string;
    onClick?: MouseEventHandler;
    "aria-label"?: string;
  }) => (
    <a href={href} aria-label={ariaLabel} onClick={onClick}>
      {children}
    </a>
  ),
}));

const AVATAR = "https://example.com/avatar.webp";

describe("StyleProviderCredit", () => {
  test("iconOnly: アバターのみ表示。非リンク時は alt にクレジットを入れる", () => {
    render(
      <StyleProviderCredit nickname="mario335599" avatarUrl={AVATAR} iconOnly />,
    );
    expect(screen.getByAltText("提供 mario335599")).toBeInTheDocument();
    // アイコンのみ=可視テキストは出さない
    expect(screen.queryByText("提供 mario335599")).toBeNull();
    // href なし=非リンク
    expect(screen.queryByRole("link")).toBeNull();
  });

  test("iconOnly + href: リンク化し、二重読み上げ防止で img alt は空になる", () => {
    render(
      <StyleProviderCredit
        nickname="mario335599"
        avatarUrl={AVATAR}
        iconOnly
        href="/users/u1"
      />,
    );
    const link = screen.getByRole("link", { name: "提供 mario335599" });
    expect(link).toHaveAttribute("href", "/users/u1");
    // alt は空(aria-label が名前を担う)
    expect(screen.queryByAltText("提供 mario335599")).toBeNull();
    // onClick(stopPropagation)が配線されていること(クリックで例外が出ない)
    fireEvent.click(link);
    expect(link).toBeInTheDocument();
  });

  test("ピル + href: 可視は名前のみ、リンクのアクセシブル名は『提供 名前』", () => {
    render(
      <StyleProviderCredit
        nickname="mario335599"
        avatarUrl={AVATAR}
        href="/users/u1"
        size="lg"
      />,
    );
    expect(
      screen.getByRole("link", { name: "提供 mario335599" }),
    ).toBeInTheDocument();
    expect(screen.getByText("mario335599")).toBeInTheDocument();
    // 可視テキストに接頭辞「提供」は出さない
    expect(screen.queryByText("提供 mario335599")).toBeNull();
  });

  test("アバター無し(非iconOnly): 画像を出さず名前テキストのみ(非リンク)", () => {
    render(<StyleProviderCredit nickname="mario335599" avatarUrl={null} />);
    expect(screen.getByText("mario335599")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  test("iconOnly + アバター無し: ニックネームを出さずデフォルトアイコン(role=img)を表示", () => {
    render(
      <StyleProviderCredit nickname="mario335599" avatarUrl={null} iconOnly />,
    );
    // ニックネームのテキストは出さない
    expect(screen.queryByText("mario335599")).toBeNull();
    // デフォルトアイコン(灰丸 + User)を role=img + aria-label で表現
    expect(
      screen.getByRole("img", { name: "提供 mario335599" }),
    ).toBeInTheDocument();
  });

  test("locale='en': 接頭辞が by になる", () => {
    render(
      <StyleProviderCredit
        nickname="mario335599"
        avatarUrl={AVATAR}
        iconOnly
        locale="en"
      />,
    );
    expect(screen.getByAltText("by mario335599")).toBeInTheDocument();
  });
});
