/** @jest-environment jsdom */

import React from "react";
import { render, screen } from "@testing-library/react";
import { ReplyQuoteHeader } from "@/features/posts/components/ReplyQuoteHeader";

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={props.src} alt={props.alt} />
  ),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const T: Record<string, string> = {
      replyQuoteDeleted: "削除されたコメント",
      anonymousUser: "匿名ユーザー",
    };
    return T[key] ?? key;
  },
}));

const QUOTE = {
  user_id: "user-9",
  nickname: "hanako",
  avatar_url: "https://example.com/avatar.webp",
  content_preview: "元の返信テキスト",
};

describe("ReplyQuoteHeader", () => {
  test("引用なし(reply_to=null, 未削除)の場合_何も表示しない", () => {
    const { container } = render(
      <ReplyQuoteHeader replyTo={null} replyToDeleted={false} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("引用先が存命の場合_アバターと@ニックネームとプレビューをプロフィールリンク付きで表示する", () => {
    const { container } = render(
      <ReplyQuoteHeader replyTo={QUOTE} replyToDeleted={false} />
    );

    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/users/user-9");
    expect(screen.getByText("@hanako")).not.toBeNull();
    expect(screen.getByText("元の返信テキスト")).not.toBeNull();
    // アバターは装飾画像(alt="")のため role ではなくタグで確認する。
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://example.com/avatar.webp"
    );
  });

  test("引用先ユーザーが不明(user_id=null)の場合_リンクなしで表示する", () => {
    render(
      <ReplyQuoteHeader
        replyTo={{ ...QUOTE, user_id: null }}
        replyToDeleted={false}
      />
    );

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("@hanako")).not.toBeNull();
  });

  test("引用先が削除済みの場合_フォールバック文言をリンクなしで表示する", () => {
    render(<ReplyQuoteHeader replyTo={null} replyToDeleted={true} />);

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("削除されたコメント")).not.toBeNull();
  });

  test("ニックネームが無い場合_匿名ユーザー表記になる", () => {
    render(
      <ReplyQuoteHeader
        replyTo={{ ...QUOTE, nickname: null }}
        replyToDeleted={false}
      />
    );

    expect(screen.getByText("@匿名ユーザー")).not.toBeNull();
  });
});
