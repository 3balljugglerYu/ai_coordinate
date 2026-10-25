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
import {
  AUTO_SCROLL_MIN_ITEMS,
  HomeHalloweenCatalogShelf,
} from "@/features/home/components/HomeHalloweenCatalogShelf";
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
// Swiper の代わり。作られたときに onSwiper へ、位置だけ持つ偽物を渡す(流れている位置を残す確認に使う)
const mockSwiper = {
  translate: 0,
  animating: false,
  snapGrid: [0, 192, 384],
  wrapperEl: null as HTMLElement | null,
  update: () => {},
  setTranslate(value: number) {
    mockSwiper.translate = value;
    if (mockSwiper.wrapperEl) mockSwiper.wrapperEl.style.transform = `translate3d(${value}px, 0px, 0px)`;
  },
};
jest.mock("swiper/react", () => {
  const { useEffect } = jest.requireActual<typeof import("react")>("react");
  return {
    Swiper: ({ children, onSwiper }: { children: React.ReactNode; onSwiper?: (swiper: unknown) => void }) => {
      useEffect(() => {
        mockSwiper.wrapperEl = document.createElement("div");
        onSwiper?.(mockSwiper);
      }, [onSwiper]);
      return <div>{children}</div>;
    },
    SwiperSlide: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});
jest.mock("swiper/modules", () => ({ FreeMode: {} }));
jest.mock("swiper/css", () => ({}));
jest.mock("swiper/css/free-mode", () => ({}));

const gtag = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockLocale.mockReturnValue("ja");
  (window as unknown as { gtag?: unknown }).gtag = gtag;
  // 8件からは自動で流す。jsdom に無いので、描画のループと見え方の監視は止めておく
  window.requestAnimationFrame = jest.fn(() => 0) as unknown as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = jest.fn();
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // jsdom に無い。見えている位置(transform の横の移動)だけ読めればよい
  (globalThis as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly = class {
    m41: number;
    constructor(transform: string) {
      const match = /translate3d\((-?[\d.]+)px/.exec(transform ?? "");
      this.m41 = match ? Number(match[1]) : 0;
    }
  };
  window.sessionStorage.clear();
});

afterEach(() => {
  delete (window as unknown as { gtag?: unknown }).gtag;
});

function item(postId: string, authorName: string): CampaignSubmissionItem {
  return { postId, authorName, thumbnailUrl: `https://img.test/${postId}.webp` };
}

const ITEMS = [item("post-1", "はるぼぼ"), item("post-2", "マサ"), item("post-3", "りる")];

function manyItems(count: number): CampaignSubmissionItem[] {
  return Array.from({ length: count }, (_, index) => item(`post-${index + 1}`, `作者${index + 1}`));
}

/** 読み上げ・キーボードの対象になっている作品のリンク(3組のうち真ん中の組) */
function primaryWorks(): HTMLElement[] {
  return screen
    .getAllByTestId("home-halloween-shelf-work")
    .filter((work) => work.getAttribute("aria-hidden") !== "true");
}

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

  describe("エントリーした人の進み具合(2026-10-17 ユーザー指示)", () => {
    test("⭐進み具合が渡されたら、棚の見出しの上に出す", () => {
      render(<HomeHalloweenCatalogShelf items={ITEMS} entryProgress={{ entered: true, usedWorks: 4 }} />);

      const shelf = screen.getByTestId("home-halloween-catalog-shelf");
      const progress = screen.getByTestId("home-halloween-entry-progress");
      const heading = within(shelf).getByRole("heading", { level: 2 });
      expect(shelf.contains(progress)).toBe(true);
      // 進み具合が先(上)、見出しがあと
      expect(progress.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(progress.textContent).toContain("現在 4作品(1口)");
    });

    test("渡されなければ(未ログイン・読めなかった)、進み具合も呼びかけも出さない", () => {
      render(<HomeHalloweenCatalogShelf items={ITEMS} />);

      expect(screen.queryByTestId("home-halloween-entry-progress")).toBeNull();
      expect(screen.queryByTestId("home-halloween-entry-invite")).toBeNull();
    });

    /*
      2026-10-25 ユーザー指示: ログインしていてまだエントリーしていない人(全員)には、同じ場所でエントリーを呼びかける。
      文はポジティブに「🎁 エントリーして、Amazonギフトカードを当てよう！」だけ。ボタンの見た目・改行させない。たまった数は出さない
    */
    test("⭐まだエントリーしていなければ、棚の見出しの上に「エントリーして、Amazonギフトカードを当てよう！」を出す", () => {
      render(<HomeHalloweenCatalogShelf items={ITEMS} entryProgress={{ entered: false }} />);

      const shelf = screen.getByTestId("home-halloween-catalog-shelf");
      const invite = screen.getByTestId("home-halloween-entry-invite");
      const heading = within(shelf).getByRole("heading", { level: 2 });
      expect(shelf.contains(invite)).toBe(true);
      expect(invite.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      const link = within(invite).getByRole("link", { name: "🎁 エントリーして、Amazonギフトカードを当てよう！" });
      // 押すと企画ページのエントリーの項目へ
      expect(link.getAttribute("href")).toBe("/campaigns/halloween-best-shot#hbs-entry-top");
      // 改行させない
      expect(link.className).toContain("whitespace-nowrap");
      // 進み具合は出さない・たまった数も出さない
      expect(screen.queryByTestId("home-halloween-entry-progress")).toBeNull();
      expect(invite.textContent).not.toMatch(/作品/);
      // この1行だけ(注記は添えない。ユーザー指示)
      expect(invite.textContent).toBe("🎁 エントリーして、Amazonギフトカードを当てよう！");
    });

    test("呼びかけを押したら GA4 に送る(進み具合とは別の名前)", () => {
      render(<HomeHalloweenCatalogShelf items={ITEMS} entryProgress={{ entered: false }} />);

      fireEvent.click(screen.getByRole("link", { name: "🎁 エントリーして、Amazonギフトカードを当てよう！" }));

      expect(gtag).toHaveBeenCalledWith("event", "campaign_home_entry_invite_tap", {});
    });

    test("対象作品が読めない・まだないときも、呼びかけだけは出す(棚は出さない)", () => {
      render(<HomeHalloweenCatalogShelf items={[]} entryProgress={{ entered: false }} />);

      expect(screen.getByTestId("home-halloween-entry-invite")).toBeTruthy();
      expect(screen.queryByTestId("home-halloween-catalog-shelf")).toBeNull();
    });

    test("対象作品がないとき、エントリー済み・未ログインなら何も出さない", () => {
      const { container, rerender } = render(
        <HomeHalloweenCatalogShelf items={[]} entryProgress={{ entered: true, usedWorks: 2 }} />,
      );
      expect(container.innerHTML).toBe("");
      rerender(<HomeHalloweenCatalogShelf items={[]} />);
      expect(container.innerHTML).toBe("");
    });

    test("日本語でない画面では、呼びかけも出さない(企画は日本国内向け)", () => {
      mockLocale.mockReturnValue("en");
      const { rerender } = render(<HomeHalloweenCatalogShelf items={ITEMS} entryProgress={{ entered: false }} />);
      expect(screen.queryByTestId("home-halloween-entry-invite")).toBeNull();
      rerender(<HomeHalloweenCatalogShelf items={[]} entryProgress={{ entered: false }} />);
      expect(screen.queryByTestId("home-halloween-entry-invite")).toBeNull();
    });

    test("エントリー済みなら、呼びかけは出さない", () => {
      render(<HomeHalloweenCatalogShelf items={ITEMS} entryProgress={{ entered: true, usedWorks: 0 }} />);

      expect(screen.getByTestId("home-halloween-entry-progress")).toBeTruthy();
      expect(screen.queryByTestId("home-halloween-entry-invite")).toBeNull();
    });

    test("日本語でない画面では、棚ごと出さない(進み具合も出ない)", () => {
      mockLocale.mockReturnValue("en");

      render(<HomeHalloweenCatalogShelf items={ITEMS} entryProgress={{ entered: true, usedWorks: 4 }} />);

      expect(screen.queryByTestId("home-halloween-entry-progress")).toBeNull();
    });
  });

  describe("簡単お着替えのように自動で流す(2026-10-17 ユーザー指示)", () => {
    test(`⭐${AUTO_SCROLL_MIN_ITEMS}件からは3組並べて流す。読み上げ・キーボードは真ん中の1組だけ`, () => {
      const items = manyItems(AUTO_SCROLL_MIN_ITEMS);
      render(<HomeHalloweenCatalogShelf items={items} />);

      const all = screen.getAllByTestId("home-halloween-shelf-work");
      expect(all).toHaveLength(items.length * 3);
      expect(primaryWorks().map((work) => work.getAttribute("href"))).toEqual(
        items.map((it) => `/posts/${it.postId}`),
      );
      // 残りの2組は、読み上げずキーボードでも止まらない
      const duplicates = all.filter((work) => work.getAttribute("aria-hidden") === "true");
      expect(duplicates).toHaveLength(items.length * 2);
      duplicates.forEach((work) => expect(work.getAttribute("tabindex")).toBe("-1"));
      // 自動で流し始めている
      expect(window.requestAnimationFrame).toHaveBeenCalled();
    });

    test("流すのは、1組の幅が PC の棚の幅(いちばん広くて 1,120px ほど)より長くなる数から", () => {
      // 3組並べて流すので、1組が棚より短いと、つなぎ目にすき間が見える。カード 180px + すき間 12px
      expect(AUTO_SCROLL_MIN_ITEMS * (180 + 12)).toBeGreaterThanOrEqual(1120);
    });

    test(`${AUTO_SCROLL_MIN_ITEMS - 1}件までは1組だけ並べ、流さない(つなぎ目のすき間が見えるため)`, () => {
      const items = manyItems(AUTO_SCROLL_MIN_ITEMS - 1);
      render(<HomeHalloweenCatalogShelf items={items} />);

      const all = screen.getAllByTestId("home-halloween-shelf-work");
      expect(all).toHaveLength(items.length);
      expect(all.every((work) => work.getAttribute("aria-hidden") === null)).toBe(true);
      expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    });

    test("作品を押したら、戻ったときに続きから流せるよう、流れている位置を残す", () => {
      render(<HomeHalloweenCatalogShelf items={manyItems(AUTO_SCROLL_MIN_ITEMS)} />);
      // 真ん中の組から始まっている(1組 = 8件 × 192px)
      expect(mockSwiper.translate).toBe(-AUTO_SCROLL_MIN_ITEMS * 192);
      mockSwiper.setTranslate(-1700);

      fireEvent.click(primaryWorks()[2]);

      expect(window.sessionStorage.getItem("home-halloween-shelf-translate")).toBe("-1700");
    });

    test("流れてきた複製の組のカードを押しても、作品のページへ進み、記録も送る", () => {
      render(<HomeHalloweenCatalogShelf items={manyItems(AUTO_SCROLL_MIN_ITEMS)} />);
      const duplicate = screen
        .getAllByTestId("home-halloween-shelf-work")
        .find((work) => work.getAttribute("aria-hidden") === "true")!;

      fireEvent.click(duplicate);

      expect(duplicate.getAttribute("href")).toBe("/posts/post-1");
      expect(gtag).toHaveBeenCalledWith("event", "campaign_home_shelf_work_tap", {});
    });
  });
});
