/** @jest-environment jsdom */

/**
 * ホームのバナーを押したときの GA4 イベント(2026-10-16)。
 * ポップアップは DB に記録しているが、バナーは記録が無く、企画ページへの入口としてどちらが効いたか比べられなかった。
 * 送るのは管理画面で決めた値(ID と行き先)だけ。
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { HomeBannerCard } from "@/features/home/components/HomeBannerCard";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    onClick,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  }) => (
    <a
      href={href}
      {...rest}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
    >
      {children}
    </a>
  ),
}));
jest.mock("next/image", () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element -- テスト用に next/image を素の img に置き換える
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));

const gtag = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (window as unknown as { gtag?: unknown }).gtag = gtag;
});

afterEach(() => {
  delete (window as unknown as { gtag?: unknown }).gtag;
});

function banner(linkUrl: string) {
  return { id: "8aaf3545-18d7-48a9-b4ae-6b16535be8c2", imageUrl: "https://img.test/banner.webp", linkUrl, alt: "ハロウィン企画" };
}

describe("ホームのバナー", () => {
  test("⭐中のページへのバナーを押したら、バナーの ID と行き先を送る", () => {
    render(<HomeBannerCard banner={banner("/campaigns/halloween-best-shot")} />);

    fireEvent.click(screen.getByRole("link"));

    expect(gtag).toHaveBeenCalledWith("event", "home_banner_click", {
      banner_id: "8aaf3545-18d7-48a9-b4ae-6b16535be8c2",
      link_url: "/campaigns/halloween-best-shot",
    });
  });

  test("外のサイトへのバナー(新しいタブ)でも送る", () => {
    render(<HomeBannerCard banner={banner("https://www.persta.ai/tools/image-split")} />);
    const link = screen.getByRole("link");
    link.addEventListener("click", (event) => event.preventDefault());

    fireEvent.click(link);

    expect(gtag).toHaveBeenCalledWith("event", "home_banner_click", {
      banner_id: "8aaf3545-18d7-48a9-b4ae-6b16535be8c2",
      link_url: "https://www.persta.ai/tools/image-split",
    });
  });

  test("危ない行き先は # に置き換えたあとの値を送る(管理画面の値をそのまま流さない)", () => {
    render(<HomeBannerCard banner={banner("javascript:alert(1)")} />);

    fireEvent.click(screen.getByRole("link"));

    expect(gtag).toHaveBeenCalledWith("event", "home_banner_click", {
      banner_id: "8aaf3545-18d7-48a9-b4ae-6b16535be8c2",
      link_url: "#",
    });
  });
});
