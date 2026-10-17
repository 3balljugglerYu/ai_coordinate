/** @jest-environment jsdom */

/**
 * ホームの「ハロウィン企画」の棚(2026-10-17 ユーザー決定)。
 *
 * 企画の軸は「みんなのカタログを使ってもらうこと」。Persta ORIGINAL を数えに入れる代わりに、
 * 対象作品(みんなのカタログ)を簡単お着替えの上に、同じ形のカードで並べる。
 * 期間はサーバーが決め、期間外は items が空で届く。企画は日本国内向けなので日本語の画面だけ。
 */

import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { HomeHalloweenCatalogShelf } from "@/features/home/components/HomeHalloweenCatalogShelf";
import { HALLOWEEN_BEST_SHOT } from "@/features/campaigns/halloween/halloween-best-shot";
import type { CampaignSubmissionItem } from "@/features/campaigns/hashtag-campaign/get-submission-pages";

const mockLocale = jest.fn(() => "ja");
jest.mock("next-intl", () => ({
  useLocale: () => mockLocale(),
  useTranslations: () => (key: string) => (key === "styleBrowseAll" ? "すべて見る" : key),
}));
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
jest.mock("swiper/react", () => ({
  Swiper: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SwiperSlide: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock("swiper/modules", () => ({ FreeMode: {} }));
jest.mock("swiper/css", () => ({}));
jest.mock("swiper/css/free-mode", () => ({}));

const gtag = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockLocale.mockReturnValue("ja");
  (window as unknown as { gtag?: unknown }).gtag = gtag;
});

afterEach(() => {
  delete (window as unknown as { gtag?: unknown }).gtag;
});

function item(postId: string, authorName: string): CampaignSubmissionItem {
  return { postId, authorName, thumbnailUrl: `https://img.test/${postId}.webp` };
}

const ITEMS = [item("post-1", "はるぼぼ"), item("post-2", "マサ"), item("post-3", "りる")];

describe("ホームの「ハロウィン企画」の棚", () => {
  test("⭐対象作品を、ラベルと作者の名前つきで並べ、押すと作品のページへ", () => {
    render(<HomeHalloweenCatalogShelf items={ITEMS} />);

    const shelf = screen.getByTestId("home-halloween-catalog-shelf");
    expect(within(shelf).getByRole("heading", { level: 2 }).textContent).toContain(
      HALLOWEEN_BEST_SHOT.homeShelf.title,
    );
    expect(shelf.textContent).toContain(HALLOWEEN_BEST_SHOT.homeShelf.caption);

    const works = within(shelf).getAllByTestId("home-halloween-shelf-work");
    expect(works.map((work) => work.getAttribute("href"))).toEqual([
      "/posts/post-1",
      "/posts/post-2",
      "/posts/post-3",
    ]);
    // どのカードにも「ハロウィン企画対象！」と作者の名前
    works.forEach((work, index) => {
      expect(work.textContent).toContain(HALLOWEEN_BEST_SHOT.targetBadgeLabel);
      expect(work.textContent).toContain(ITEMS[index].authorName);
    });
    expect(within(works[0]).getByRole("img").getAttribute("alt")).toBe("はるぼぼさんの作品");
  });

  test("「すべて見る」は、みんなのカタログの企画タブへ", () => {
    render(<HomeHalloweenCatalogShelf items={ITEMS} />);

    expect(screen.getByRole("link", { name: /すべて見る/ }).getAttribute("href")).toBe(
      HALLOWEEN_BEST_SHOT.catalogHref,
    );
    expect(HALLOWEEN_BEST_SHOT.catalogHref).toBe("/user-styles?campaign=halloween-best-shot");
  });

  test("作品の ID は URL に入れられる形にする", () => {
    render(<HomeHalloweenCatalogShelf items={[item("a b/c", "だれか")]} />);

    expect(screen.getByTestId("home-halloween-shelf-work").getAttribute("href")).toBe(
      "/posts/a%20b%2Fc",
    );
  });

  test("作品が無い(期間外・まだ無い・読めなかった)ときは、棚ごと出さない", () => {
    const { container } = render(<HomeHalloweenCatalogShelf items={[]} />);

    expect(container.innerHTML).toBe("");
  });

  test("日本語の画面でなければ出さない(企画は日本国内向け)", () => {
    mockLocale.mockReturnValue("en");

    const { container } = render(<HomeHalloweenCatalogShelf items={ITEMS} />);

    expect(container.innerHTML).toBe("");
  });

  test("作品を押したら campaign_home_shelf_work_tap、「すべて見る」なら campaign_home_shelf_all を送る", () => {
    render(<HomeHalloweenCatalogShelf items={ITEMS} />);

    fireEvent.click(screen.getAllByTestId("home-halloween-shelf-work")[1]);
    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenLastCalledWith("event", "campaign_home_shelf_work_tap", {});

    fireEvent.click(screen.getByRole("link", { name: /すべて見る/ }));
    expect(gtag).toHaveBeenCalledTimes(2);
    expect(gtag).toHaveBeenLastCalledWith("event", "campaign_home_shelf_all", {});
  });

  test("GA4 が読み込めていなくても、押せる(落ちない)", () => {
    delete (window as unknown as { gtag?: unknown }).gtag;
    render(<HomeHalloweenCatalogShelf items={ITEMS} />);

    expect(() => fireEvent.click(screen.getAllByTestId("home-halloween-shelf-work")[0])).not.toThrow();
  });
});
