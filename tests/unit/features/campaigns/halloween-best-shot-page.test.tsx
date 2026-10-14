/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { HalloweenBestShotPage } from "@/features/campaigns/halloween/components/HalloweenBestShotPage";
import { RevealOnScroll } from "@/features/campaigns/halloween/components/RevealOnScroll";
import { HALLOWEEN_BEST_SHOT } from "@/features/campaigns/halloween/halloween-best-shot";

jest.mock("next/image", () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element -- テスト用に next/image を素の img に置き換える
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));

describe("ハロウィン企画「うちの子のベストショット with Halloween Magic」のページ(2026-10-12)", () => {
  test("題名・期間・発表・ハッシュタグを出す", () => {
    render(<HalloweenBestShotPage />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toContain("うちの子の");
    expect(h1.textContent).toContain("ベストショット");
    expect(h1.textContent).toContain("with Halloween Magic");
    expect(document.body.textContent).toContain("10/16(金) 20:00 〜 10/31(土) 23:59");
    expect(document.body.textContent).toContain("結果発表：終了後 1週間程度");
    expect(screen.getAllByText(HALLOWEEN_BEST_SHOT.hashtag).length).toBeGreaterThanOrEqual(2);
  });

  test("参加のボタンは CREATE(/free) へ行く(冒頭と締めの2か所)", () => {
    render(<HalloweenBestShotPage />);
    const links = screen.getAllByRole("link", { name: /CREATEで参加する/ });
    expect(links).toHaveLength(2);
    links.forEach((link) => expect(link.getAttribute("href")).toBe("/free"));
  });

  test("応募作をつかうボタンは、ハッシュタグの検索へ行く(冒頭と締めの2か所)", () => {
    render(<HalloweenBestShotPage />);
    const links = screen.getAllByRole("link", { name: /応募作をつかう/ });
    expect(links).toHaveLength(2);
    links.forEach((link) =>
      expect(link.getAttribute("href")).toBe(`/search?q=${encodeURIComponent("#うちの子のベストショット")}`),
    );
  });

  test("企画についてで、プロンプトは非公開のままでよいことと、使った人にも当たるチャンスを書く", () => {
    render(<HalloweenBestShotPage />);
    const about = screen.getByRole("region", { name: /企画について/ });
    expect(about.textContent).toContain("プロンプトの内容は非公開のままなので、安心して公開・利用できます");
    expect(about.textContent).toContain("今回のテーマは 「ハロウィン」");
    expect(about.textContent).toContain("選ばれた方には、Amazonギフトカードをプレゼント！");
    expect(about.textContent).toContain("プロンプトを使ってイラストを生成してくれた方にも、Amazonギフトカードが当たるチャンス！");
  });

  test("企画についての「プロンプト作成者のメリットはこちら」は、プロンプト利用の案内(/use-prompts)へ行く", () => {
    render(<HalloweenBestShotPage />);
    const link = screen.getByRole("link", { name: "プロンプト作成者のメリットはこちら" });
    expect(link.getAttribute("href")).toBe("/use-prompts");
  });

  test("参加方法は「つくる人」「つかう人」のタブで、最初はつくる人を出す", () => {
    render(<HalloweenBestShotPage />);
    const creatorTab = screen.getByRole("tab", { name: /つくる人/ });
    const userTab = screen.getByRole("tab", { name: /つかう人/ });
    expect(creatorTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel", { name: /つくる人/ })).toBeTruthy();
    expect(screen.queryByRole("tabpanel", { name: /つかう人/ })).toBeNull();

    fireEvent.click(userTab);
    expect(userTab.getAttribute("aria-selected")).toBe("true");
    expect(creatorTab.getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tabpanel", { name: /つかう人/ })).toBeTruthy();
    expect(screen.queryByRole("tabpanel", { name: /つくる人/ })).toBeNull();
  });

  test("タブは左右の矢印キーでも切り替えられる", () => {
    render(<HalloweenBestShotPage />);
    const creatorTab = screen.getByRole("tab", { name: /つくる人/ });
    fireEvent.keyDown(creatorTab, { key: "ArrowRight" });
    const userTab = screen.getByRole("tab", { name: /つかう人/ });
    expect(userTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(userTab);
    fireEvent.keyDown(userTab, { key: "ArrowRight" });
    expect(creatorTab.getAttribute("aria-selected")).toBe("true");
  });

  test("つかう人の手順は6つで、応募作をさがす入口と口数の表がある", () => {
    render(<HalloweenBestShotPage />);
    fireEvent.click(screen.getByRole("tab", { name: /つかう人/ }));
    const steps = screen.getAllByTestId("halloween-join-step-user");
    expect(steps).toHaveLength(6);
    const entries = within(steps[0]).getByRole("link", { name: /応募作を見る/ });
    expect(entries.getAttribute("href")).toBe(HALLOWEEN_BEST_SHOT.entriesHref);
    expect(within(steps[1]).getAllByTestId("shot-ring")).toHaveLength(1);
    expect(within(steps[5]).getByTestId("halloween-tickets").textContent).toBe("3作品▶1口6作品▶2口10作品▶3口");
    const panel = screen.getByRole("tabpanel", { name: /つかう人/ });
    expect(panel.textContent).toContain("自分の応募作を使った投稿は数えません");
    expect(panel.textContent).toContain("何回使っても1作品");
  });

  test("つくる人の参加方法は9つの手順で、画面のスクショに押す場所の枠を重ねる", () => {
    render(<HalloweenBestShotPage />);
    const steps = screen.getAllByTestId("halloween-join-step-creator");
    expect(steps).toHaveLength(9);
    expect(within(steps[0]).getAllByTestId("shot-ring")).toHaveLength(1);
    expect(within(steps[7]).getByRole("button", { name: "コピーする" })).toBeTruthy();
    expect(within(steps[7]).getByText(HALLOWEEN_BEST_SHOT.hashtag)).toBeTruthy();
    // 投稿の画面は、箇条の番号と同じ数だけ赤枠を付ける
    expect(within(steps[7]).getAllByRole("listitem")).toHaveLength(3);
    expect(within(steps[7]).getAllByTestId("shot-ring")).toHaveLength(3);
  });

  test("審査のポイントは3つ(ハロウィンらしさ・うちの子らしさ・使ってみたくなる魅力。安定性は 10/14 に削除)", () => {
    render(<HalloweenBestShotPage />);
    const names = screen
      .getAllByTestId("halloween-judge-point")
      .map((point) => point.querySelector("b")?.textContent);
    expect(names).toEqual(["ハロウィンらしさ", "うちの子らしさ", "使ってみたくなる魅力"]);
  });

  test("その他に、Xへのシェアと運営の応援を書く", () => {
    render(<HalloweenBestShotPage />);
    const tips = screen.getAllByTestId("halloween-more-tip").map((tip) => tip.textContent);
    expect(tips).toEqual([
      expect.stringContaining("Xにシェアすると"),
      expect.stringContaining("「いいね」などで応援します"),
    ]);
  });

  test("賞品: 最優秀賞 10,000円分 1名様／優秀賞 5,000円分 2名様", () => {
    render(<HalloweenBestShotPage />);
    const prizes = screen.getAllByTestId("halloween-prize").map((node) => node.textContent);
    expect(prizes).toEqual(["🏆最優秀賞10,000円分1名様", "🎖️優秀賞5,000円分2名様"]);
  });

  test("つかう人の賞(抽選): Amazonギフト券 1,000円分 10名様／ペルコイン 300枚 30名様。両方には当選しない", () => {
    render(<HalloweenBestShotPage />);
    const prizes = screen.getAllByTestId("halloween-user-prize").map((node) => node.textContent);
    expect(prizes).toEqual(["🎁Amazonギフト券1,000円分10名様", "🪙ペルコイン300枚30名様"]);
    expect(screen.getByText("※ つくる人の賞とつかう人の賞の、両方には当選しません")).toBeTruthy();
    expect(document.body.textContent).toContain("Amazonギフト券 総額3万円");
  });

  test("セクションの見出しは文字のまま(読み上げ・翻訳のため画像にしない)", () => {
    render(<HalloweenBestShotPage />);
    const names = screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent);
    expect(names).toEqual([
      "ABOUT企画について",
      "PRIZE賞品",
      "HOW TO JOIN参加方法",
      "POINT審査のポイント",
      "SCHEDULEスケジュール",
      "MOREその他",
      "あなたのベストショット、待ってます",
    ]);
  });

  test("ガチャプロンプトは対象外と書く", () => {
    render(<HalloweenBestShotPage />);
    expect(screen.getByText("※ ガチャプロンプトは対象外です")).toBeTruthy();
  });

  test("飾り(コウモリ・おばけ・クモ・ランタン・波・旗)は読み上げない", () => {
    const { container } = render(<HalloweenBestShotPage />);
    const svgs = Array.from(container.querySelectorAll("svg"));
    expect(svgs.length).toBeGreaterThan(5);
    svgs.forEach((svg) => expect(svg.getAttribute("aria-hidden")).toBe("true"));
  });

  test("冒頭の作例は5枚で、どれにも説明(alt)がある。流すための2回目の並びは読み上げない", () => {
    render(<HalloweenBestShotPage />);
    const header = screen.getByRole("banner");
    const gallery = within(header).getByRole("group", { name: "ペルスタで生成したハロウィンのイラストの例" });
    const cards = within(gallery).getAllByTestId("halloween-gallery-card");
    expect(cards).toHaveLength(5);
    cards.forEach((card) => expect(card.querySelector("img")?.getAttribute("alt")).not.toBe(""));
    // 読み上げで見える画像は1回目の5枚だけ
    expect(within(gallery).getAllByRole("img")).toHaveLength(5);
  });
});

describe("RevealOnScroll(スクロールでふわっと出す)", () => {
  const original = globalThis.IntersectionObserver;
  afterEach(() => {
    globalThis.IntersectionObserver = original;
  });

  test("画面に入ったら data-revealed を true にし、見張りをやめる", () => {
    let callback: IntersectionObserverCallback = () => undefined;
    const disconnect = jest.fn();
    globalThis.IntersectionObserver = jest.fn((cb: IntersectionObserverCallback) => {
      callback = cb;
      return { observe: jest.fn(), disconnect, unobserve: jest.fn(), takeRecords: jest.fn() };
    }) as unknown as typeof IntersectionObserver;
    render(<RevealOnScroll>中身</RevealOnScroll>);
    const box = screen.getByText("中身");
    expect(box.getAttribute("data-revealed")).toBe("false");
    act(() => callback([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(box.getAttribute("data-revealed")).toBe("false");
    act(() => callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(box.getAttribute("data-revealed")).toBe("true");
    expect(disconnect).toHaveBeenCalled();
  });

  test("縦長のカードでも出せるよう、割合ではなく端が入ったかで判定する(PCで参加方法が透明のままだった不具合)", () => {
    let options: IntersectionObserverInit | undefined;
    globalThis.IntersectionObserver = jest.fn(
      (_callback: IntersectionObserverCallback, init?: IntersectionObserverInit) => {
        options = init;
        return { observe: jest.fn(), disconnect: jest.fn(), unobserve: jest.fn(), takeRecords: jest.fn() };
      },
    ) as unknown as typeof IntersectionObserver;
    render(<RevealOnScroll>中身</RevealOnScroll>);
    expect(options?.threshold).toBe(0);
  });

  test("IntersectionObserver が無い環境では、すぐに出す", () => {
    // @ts-expect-error 古い環境を再現する
    delete globalThis.IntersectionObserver;
    render(<RevealOnScroll>中身</RevealOnScroll>);
    expect(screen.getByText("中身").getAttribute("data-revealed")).toBe("true");
  });
});
