/**
 * @jest-environment jsdom
 */
import { act, render, screen, within } from "@testing-library/react";
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

  test("企画についての「利用特典について」は、プロンプト利用の案内(/use-prompts)へ行く", () => {
    render(<HalloweenBestShotPage />);
    const link = screen.getByRole("link", { name: "利用特典について" });
    expect(link.getAttribute("href")).toBe("/use-prompts");
  });

  test("参加方法は7つの手順で、画面のスクショに押す場所の枠を重ねる", () => {
    render(<HalloweenBestShotPage />);
    const steps = screen.getAllByTestId("halloween-join-step");
    expect(steps).toHaveLength(7);
    expect(within(steps[0]).getAllByTestId("shot-ring")).toHaveLength(1);
    expect(within(steps[5]).getByRole("button", { name: "コピーする" })).toBeTruthy();
    expect(within(steps[5]).getByText(HALLOWEEN_BEST_SHOT.hashtag)).toBeTruthy();
  });

  test("賞品: 最優秀賞 10,000円分 1名様／優秀賞 5,000円分 2名様", () => {
    render(<HalloweenBestShotPage />);
    const prizes = screen.getAllByTestId("halloween-prize").map((node) => node.textContent);
    expect(prizes).toEqual(["🏆最優秀賞10,000円分1名様", "🎖️優秀賞5,000円分2名様"]);
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

  test("作例の画像には説明(alt)がある", () => {
    render(<HalloweenBestShotPage />);
    const header = screen.getByRole("banner");
    expect(within(header).getByAltText("ペルスタで生成したハロウィンのイラストの例")).toBeTruthy();
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

  test("IntersectionObserver が無い環境では、すぐに出す", () => {
    // @ts-expect-error 古い環境を再現する
    delete globalThis.IntersectionObserver;
    render(<RevealOnScroll>中身</RevealOnScroll>);
    expect(screen.getByText("中身").getAttribute("data-revealed")).toBe("true");
  });
});
