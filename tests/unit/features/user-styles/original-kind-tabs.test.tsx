/**
 * カタログのタブ（ペルスタのカタログ / みんなのカタログ / カタログをつくる）。
 *
 * ⭐ このコンポーネントは **layout に置く前提**（今は app/[locale]/layout.tsx の
 * TopTabsSlot から出す）。ページの中に置くと遷移のたびに remount され、ピルが
 * スライドせず瞬間移動する（一度それで「UX として最悪」と指摘を受けた）。
 * そのため現在地は props ではなく `usePathname()` から決める。
 *
 * 出すかどうか（段階公開中は運営だけ）は TopTabsSlot が決める。ここは
 * 「今どの画面か」だけを見る。
 */

import React from "react";
import { act, render, screen, within } from "@testing-library/react";
import { OriginalKindTabs } from "@/features/style-presets/components/OriginalKindTabs";

// 翻訳関数は名前空間ごとに同じものを返す。タブは選択中のタブを測ってピルを動かし、
// 翻訳関数を測り直しの依存に入れる(言語を切り替えたら測り直す)。毎回作り直すと
// 測り直しが止まらなくなる(generation-mode-tabs.test.tsx と同じ)
const mockTranslators = new Map<string, (key: string) => string>();
jest.mock("next-intl", () => ({
  useTranslations: (namespace: string) => {
    let translate = mockTranslators.get(namespace);
    if (!translate) {
      // タブの中の名前(英語)だけ本物の文言を返す。冒頭4文字で切る動きを確かめるため
      const labels: Record<string, string> = {
        tabOfficial: "Persta ORIGINAL",
        tabUser: "User ORIGINAL",
        tabCreate: "CREATE",
      };
      translate = (key: string) =>
        namespace === "userStyles" && labels[key] ? labels[key] : `${namespace}.${key}`;
      mockTranslators.set(namespace, translate);
    }
    return translate;
  },
}));

const mockPathname = jest.fn<string, []>();
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}));

// 運営かどうか(段階公開)の判定は TopTabsSlot の仕事。ここは見ないことを確かめるため、
// あえて「運営ではない」にしておく
const mockAvailable = jest.fn(() => false);
jest.mock("@/features/user-styles/components/UserStylesAvailabilityProvider", () => ({
  useUserStylesAvailable: () => mockAvailable(),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: React.forwardRef<
    HTMLAnchorElement,
    { href: string; children: React.ReactNode; prefetch?: boolean }
  >(function MockLink({ href, children, prefetch, ...props }, ref) {
    // prefetch は Link 固有の prop。DOM へ渡すと React が警告するので捨てる。
    void prefetch;
    return React.createElement("a", { href, ref, ...props }, children);
  }),
}));

// ページの見出し(選んでいるタブの名前)
const TITLES = [
  "userStyles.tabOfficialTitle",
  "userStyles.tabUserTitle",
  "userStyles.tabCreateTitle",
];
// タブの中の名前(英語)
const LABELS = ["Persta ORIGINAL", "User ORIGINAL", "CREATE"];
// 選んでいないタブに出す、名前の冒頭4文字
const SHORT_LABELS = ["Pers…", "User…", "CREA…"];

beforeEach(() => {
  jest.clearAllMocks();
});

describe("OriginalKindTabs", () => {
  test("出すかどうか(運営かどうか)は判定しない。/styles でも運営の判定を待たずに出す", () => {
    mockPathname.mockReturnValue("/ja/styles");
    render(<OriginalKindTabs />);

    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  test("タブは3つで、ペルスタのカタログ・みんなのカタログ・カタログをつくるの順", () => {
    mockPathname.mockReturnValue("/ja/styles");
    render(<OriginalKindTabs />);

    const tabs = screen.getAllByRole("tab");
    // タブの名前は英語(Persta.AI ORIGINAL / User ORIGINAL / CREATE)。読み上げもこの名前
    expect(tabs.map((tab) => tab.getAttribute("aria-label"))).toEqual(LABELS);
    expect(tabs.map((tab) => tab.getAttribute("href"))).toEqual([
      "/ja/styles",
      "/ja/user-styles",
      "/ja/free",
    ]);
  });

  /*
    ⭐ タブの中は英語の名前(Persta ORIGINAL / User ORIGINAL / CREATE)だけ。日本語の名前は
    ページの見出し(h1)に出す(2026-09-29 ユーザー指示)。
    3つ並べるとスマホでは名前が入りきらないので、選んでいるタブだけ名前を全部出し、
    ほかはアイコンと名前の冒頭4文字(「Pers…」など)にする(2026-09-29 ユーザー指示)。
    読み上げには名前を全部渡す(sr-only)。冒頭4文字は読み上げない(aria-hidden)。
  */
  test.each([
    ["/ja/styles", 0],
    ["/ja/user-styles", 1],
    ["/ja/free", 2],
  ])(
    "%s では選んでいるタブだけ英語の名前を全部出し、ほかはアイコンと冒頭4文字にする(日本語の名前はタブに入れない)",
    (pathname, activeIndex) => {
      mockPathname.mockReturnValue(pathname);
      render(<OriginalKindTabs />);

      // タブの並びの名前も英語の名前にそろえる
      expect(screen.getByRole("tablist").getAttribute("aria-label")).toBe(
        LABELS.join(" / ")
      );
      const tabs = screen.getAllByRole("tab");
      expect(tabs).toHaveLength(3);
      tabs.forEach((tab, index) => {
        expect(tab.querySelector("svg")).not.toBeNull();
        // マウスを乗せたときの名前(title)も英語の名前。日本語の名前は入れない
        expect(tab.getAttribute("title")).toBe(LABELS[index]);
        const label = within(tab).getByText(LABELS[index]);
        for (const title of TITLES) {
          expect(within(tab).queryByText(title)).toBeNull();
        }
        if (index === activeIndex) {
          expect(tab.getAttribute("aria-selected")).toBe("true");
          expect(tab.getAttribute("aria-current")).toBe("page");
          expect(label.closest(".sr-only")).toBeNull();
          expect(within(tab).queryByText(SHORT_LABELS[index])).toBeNull();
        } else {
          expect(tab.getAttribute("aria-selected")).toBe("false");
          expect(label.closest(".sr-only")).not.toBeNull();
          const short = within(tab).getByText(SHORT_LABELS[index]);
          expect(short.closest(".sr-only")).toBeNull();
          expect(short.closest('[aria-hidden="true"]')).not.toBeNull();
        }
      });
    }
  );

  test.each([
    ["/ja/styles", "userStyles.tabOfficialTitle"],
    ["/ja/user-styles", "userStyles.tabUserTitle"],
    ["/ja/free", "userStyles.tabCreateTitle"],
  ])("%s の見出し(h1)は、選んでいるタブの名前(%s)", (pathname, title) => {
    mockPathname.mockReturnValue(pathname);
    render(<OriginalKindTabs />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toBe(title);
    // 3つに共通の「カタログ」だけの見出しは、もう出さない
    expect(screen.queryByText("userStyles.catalogTitle")).toBeNull();
  });

  // タブは layout に置いたまま作り直されないので、画面を移ったら見出しも変わること
  test("タブを移ると、作り直されなくても見出し(h1)が変わる", () => {
    mockPathname.mockReturnValue("/ja/styles");
    const { rerender } = render(<OriginalKindTabs />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "userStyles.tabOfficialTitle"
    );

    mockPathname.mockReturnValue("/ja/free");
    rerender(<OriginalKindTabs />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "userStyles.tabCreateTitle"
    );
  });

  /*
    ⭐ 見出しはどの言語でも1行に収める(2026-09-29 ユーザー指示)。折り返さず、入りきらない
    言語だけ文字を小さくする。大きさが変わっても行の高さは変えない(タブが上下に動かない)。
  */
  test("見出しは折り返さず、行の高さは一定", () => {
    mockPathname.mockReturnValue("/ja/styles");
    render(<OriginalKindTabs />);

    const heading = screen.getByRole("heading", { level: 1 });
    // 大きさの基準(30px)は text-3xl。縮めるときも行の高さ(leading-9 = 36px)は変えない
    for (const cls of ["text-3xl", "whitespace-nowrap", "leading-9"]) {
      expect(heading.className).toContain(cls);
    }
  });

  describe("見出しの文字の大きさ", () => {
    /*
      jsdom は幅を測れないので、見出しに使える幅(h1 の clientWidth)と、30px で書いたときの
      見出しの幅(測る用の要素 [data-heading-measure] の offsetWidth)を決め打ちする。
    */
    const originals = {
      clientWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth"),
      offsetWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth"),
    };
    /** 見出しごとの幅(30px で書いたとき)。一番長いのは2番目の「みんなのカタログ」 */
    const TITLE_WIDTHS: Record<string, number> = {
      "userStyles.tabOfficialTitle": 400,
      "userStyles.tabUserTitle": 540,
      "userStyles.tabCreateTitle": 300,
    };
    function mockWidths(availablePx: number) {
      Object.defineProperty(HTMLElement.prototype, "clientWidth", {
        configurable: true,
        get(this: HTMLElement) {
          return this.tagName === "H1" ? availablePx : 0;
        },
      });
      Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
        configurable: true,
        get(this: HTMLElement) {
          return this.hasAttribute("data-heading-measure")
            ? (TITLE_WIDTHS[this.textContent ?? ""] ?? 0)
            : 0;
        },
      });
    }
    afterEach(() => {
      for (const key of ["clientWidth", "offsetWidth"] as const) {
        const original = originals[key];
        if (original) {
          Object.defineProperty(HTMLElement.prototype, key, original);
        } else {
          delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
        }
      }
    });

    test("一番長い見出しも入るなら、大きさは変えない", () => {
      // 一番長い見出しは 540px。使える幅 600px なら入る
      mockWidths(600);
      mockPathname.mockReturnValue("/ja/styles");
      render(<OriginalKindTabs />);

      expect(screen.getByRole("heading", { level: 1 }).style.fontSize).toBe("");
    });

    test("入りきらないなら、3つとも同じ大きさに縮める(タブを移っても大きさは同じ)", () => {
      // 一番長い 540px を 450px に収める: 30 × 450 / 540 = 25px
      // (一番長い見出しは2番目。選んでいる画面の見出しでも、1番目・3番目でもない)
      mockWidths(450);
      mockPathname.mockReturnValue("/ja/styles");
      const { rerender } = render(<OriginalKindTabs />);
      expect(screen.getByRole("heading", { level: 1 }).style.fontSize).toBe("25px");

      // 別の画面へ移っても同じ大きさ
      mockPathname.mockReturnValue("/ja/free");
      rerender(<OriginalKindTabs />);
      expect(screen.getByRole("heading", { level: 1 }).style.fontSize).toBe("25px");
    });

    /*
      測る用の要素は、3つの見出しを見出しと同じ書き方(30px・太字・折り返さない)で持つ。
      読み上げず、見出しの外に置き、隠さない(display:none だと幅が 0 になる)。
    */
    test("測る用の要素は3つの見出しを同じ書き方で持ち、読み上げない", () => {
      mockPathname.mockReturnValue("/ja/styles");
      const { container } = render(<OriginalKindTabs />);

      const heading = screen.getByRole("heading", { level: 1 });
      const measures = Array.from(container.querySelectorAll<HTMLElement>("[data-heading-measure]"));
      expect(measures.map((node) => node.textContent)).toEqual(TITLES);
      for (const node of measures) {
        expect(node.closest('[aria-hidden="true"]')).not.toBeNull();
        for (const cls of ["text-3xl", "font-bold", "whitespace-nowrap"]) {
          expect(node.className).toContain(cls);
        }
        expect(node.style.fontSize).toBe("");
        expect(heading.contains(node)).toBe(false);
        expect(node.closest('.hidden, [hidden]')).toBeNull();
      }
    });
  });

  /*
    ⭐ タブの列は中央ぞろえにしない。見出しと同じ入れ物に入れ、見出しの左端にそろえる
    (2026-09-29 ユーザー指示)。jsdom では位置を測れないので、入れ物と並べ方で確かめる
    (実際の位置は Playwright で左端の座標をそろえて確かめる)。
  */
  test("タブの列は見出しの左端にそろえる(中央ぞろえにしない)", () => {
    mockPathname.mockReturnValue("/ja/user-styles");
    render(<OriginalKindTabs />);

    const heading = screen.getByRole("heading", { level: 1 });
    const tablist = screen.getByRole("tablist");
    expect(tablist.parentElement).toBe(heading.parentElement);
    // 見出しの下にタブが来る
    expect(
      heading.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    // 入れ物とその外側に、中央ぞろえ(justify-center / text-center / items-center /
    // place-content-center など)が無いこと
    const container = tablist.parentElement!;
    expect(container.closest('[class*="center"]')).toBeNull();
    for (const centering of ["mx-auto", "self-center"]) {
      expect(tablist.className).not.toContain(centering);
    }
  });

  /*
    ⭐ ロケールを落とすと、押した瞬間に言語が既定へ戻る。
    layout に置いた以上、ロケールは props ではなく pathname から拾うしかない。
  */
  test.each(["ja", "en", "ko"])("リンク先に %s のロケールを引き継ぐ", (locale) => {
    mockPathname.mockReturnValue(`/${locale}/free`);
    render(<OriginalKindTabs />);

    const hrefs = screen.getAllByRole("tab").map((tab) => tab.getAttribute("href"));
    expect(hrefs).toEqual([
      `/${locale}/styles`,
      `/${locale}/user-styles`,
      `/${locale}/free`,
    ]);
  });

  test("ロケール無しのパスでもリンクは壊れない", () => {
    mockPathname.mockReturnValue("/user-styles");
    render(<OriginalKindTabs />);

    const hrefs = screen.getAllByRole("tab").map((tab) => tab.getAttribute("href"));
    expect(hrefs).toEqual(["/styles", "/user-styles", "/free"]);
  });

  /*
    ⭐ スタイル紹介ページ(/styles/[slug])にタブを出すと「一覧の切替」という
    意味が壊れる。/style(One-Tap の画面)もカタログのタブではない。
  */
  test.each(["/ja/styles/some-slug", "/ja/style", "/ja/posts/abc", "/"])(
    "%s では出さない",
    (pathname) => {
      mockPathname.mockReturnValue(pathname);
      const { container } = render(<OriginalKindTabs />);

      expect(container).toBeEmptyDOMElement();
    }
  );

  /*
    ⭐ タッチターゲットは最低 44x44px（project-conventions の Mobile-first ルール）。
    アイコンだけのタブも同じ。
  */
  test("タッチターゲットの高さと幅を確保する", () => {
    mockPathname.mockReturnValue("/ja/styles");
    render(<OriginalKindTabs />);

    for (const tab of screen.getAllByRole("tab")) {
      expect(tab.className).toContain("min-h-[44px]");
      expect(tab.className).toContain("min-w-[44px]");
    }
  });

  /*
    初回の描画ではピルをスライドさせない(左端から滑ってくる不自然な動きを防ぐ)。
    次のフレームからは、タブを切り替えるとスライドする。
  */
  test("ピルは初回の描画ではスライドさせず、次のフレームからスライドする", async () => {
    mockPathname.mockReturnValue("/ja/styles");
    const { container, rerender } = render(<OriginalKindTabs />);
    const pill = () =>
      container.querySelector('[role="tablist"] > span[aria-hidden]');

    expect(pill()).not.toBeNull();
    expect(pill()!.className).not.toContain("transition-[left,width]");

    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });

    expect(pill()!.className).toContain("transition-[left,width]");

    // 切り替えた直後(次のフレームを待たない)もスライドする
    mockPathname.mockReturnValue("/ja/free");
    rerender(<OriginalKindTabs />);

    expect(pill()!.className).toContain("transition-[left,width]");
  });
});
