/**
 * @jest-environment jsdom
 */
import fs from "node:fs";
import path from "node:path";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { HalloweenBestShotPage } from "@/features/campaigns/halloween/components/HalloweenBestShotPage";
import { RevealOnScroll } from "@/features/campaigns/halloween/components/RevealOnScroll";
import { HALLOWEEN_BEST_SHOT } from "@/features/campaigns/halloween/halloween-best-shot";

jest.mock("next/image", () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element -- テスト用に next/image を素の img に置き換える
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));

// エントリーのカードは開いたあとに進捗を読む。このファイルではページの中身だけを見るので、読み込み中のままにする
// (カードの動きは halloween-entry-progress-card.test.tsx)
beforeEach(() => {
  global.fetch = jest.fn(() => new Promise(() => undefined)) as unknown as typeof fetch;
});
afterEach(() => {
  // @ts-expect-error テストごとに置き換えた fetch を戻す
  delete global.fetch;
});

const SUBMISSION_PAGES = [
  [
    { postId: "p1", thumbnailUrl: "https://img.test/p1.webp", authorName: "かぼちゃ" },
    { postId: "p2", thumbnailUrl: "https://img.test/p2.webp", authorName: "こうもり" },
  ],
];

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

  test("対象作品がまだ一覧に無いとき、対象作品をつかうボタン・対象作品を見るは、ハッシュタグの検索へ行く(冒頭と締めの2か所)", () => {
    render(<HalloweenBestShotPage />);
    const links = screen.getAllByRole("link", { name: /対象作品をつかう/ });
    expect(links).toHaveLength(2);
    links.forEach((link) =>
      expect(link.getAttribute("href")).toBe(`/search?q=${encodeURIComponent("#うちの子のベストショット")}`),
    );
    fireEvent.click(screen.getByRole("tab", { name: /つかう人/ }));
    expect(screen.getByRole("link", { name: /対象作品を見る/ }).getAttribute("href")).toBe(HALLOWEEN_BEST_SHOT.entriesHref);
  });

  test("一覧に対象作品があるときは、対象作品をつかうボタン・対象作品を見るは、ページの中の一覧へ行く(10/15)", () => {
    render(<HalloweenBestShotPage submissionPages={SUBMISSION_PAGES} />);
    const links = screen.getAllByRole("link", { name: /対象作品をつかう/ });
    expect(links).toHaveLength(2);
    links.forEach((link) => expect(link.getAttribute("href")).toBe("#hbs-works"));
    fireEvent.click(screen.getByRole("tab", { name: /つかう人/ }));
    expect(screen.getByRole("link", { name: /対象作品を見る/ }).getAttribute("href")).toBe("#hbs-works");
    // 飛び先(一覧の見出し)がある
    expect(document.getElementById("hbs-works")).toBeTruthy();
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

  test("つかう人の手順は7つで、最初にエントリー。対象作品をさがす入口と口数の表がある", () => {
    render(<HalloweenBestShotPage />);
    fireEvent.click(screen.getByRole("tab", { name: /つかう人/ }));
    const steps = screen.getAllByTestId("halloween-join-step-user");
    expect(steps).toHaveLength(7);
    expect(within(steps[0]).getByRole("heading", { name: "エントリーする" })).toBeTruthy();
    // エントリーのカードは手順1の中(10/15 に独立した区画から移動)。このファイルでは読み込み中のまま
    expect(within(steps[0]).getByTestId("halloween-entry-loading")).toBeTruthy();
    const entries = within(steps[1]).getByRole("link", { name: /対象作品を見る/ });
    expect(entries.getAttribute("href")).toBe(HALLOWEEN_BEST_SHOT.entriesHref);
    expect(within(steps[2]).getAllByTestId("shot-ring")).toHaveLength(1);
    expect(within(steps[6]).getByTestId("halloween-tickets").textContent).toBe("3作品▶1口6作品▶2口10作品▶3口");
    const panel = screen.getByRole("tabpanel", { name: /つかう人/ });
    expect(panel.textContent).toContain("自分の対象作品を使った投稿は数えません");
    expect(panel.textContent).toContain("何回使っても1作品");
    expect(panel.textContent).toContain("※ 抽選はエントリーした人が対象です(エントリー前の投稿も数えます)");
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

  test("審査のポイントは「つくる人」のタブの中だけに出す(審査があるのはつくる人の賞だけ。10/14 に独立した区画から移動)", () => {
    render(<HalloweenBestShotPage />);
    const creatorPanel = screen.getByRole("tabpanel", { name: /つくる人/ });
    expect(within(creatorPanel).getByRole("heading", { name: "審査のポイント" })).toBeTruthy();
    expect(within(creatorPanel).getAllByTestId("halloween-judge-point")).toHaveLength(3);
    // ページ全体でも3つだけ(つかう人のタブや、ほかの区画には出さない)
    expect(screen.getAllByTestId("halloween-judge-point")).toHaveLength(3);
    expect(screen.getAllByRole("heading", { name: /審査のポイント/ })).toHaveLength(1);
  });

  test("その他に、Xへのシェアと運営の応援を書く", () => {
    render(<HalloweenBestShotPage />);
    const tips = screen.getAllByTestId("halloween-more-tip").map((tip) => tip.textContent);
    expect(tips).toEqual([
      expect.stringContaining("Xにシェアすると"),
      expect.stringContaining("「いいね」などで応援します"),
    ]);
  });

  test("つくる人の賞は5つ・計34名様(10/15 ユーザー決定)。賞の名前の順と、賞品・人数", () => {
    render(<HalloweenBestShotPage />);
    const prizes = screen.getAllByTestId("halloween-prize").map((item) => [
      within(item).getByRole("heading", { level: 4 }).textContent,
      within(item).getByTestId("halloween-prize-gift").textContent,
    ]);
    expect(prizes).toEqual([
      ["🏆 ハロウィン・ベストショット賞", "Amazonギフトカード 10,000円分1名様"],
      ["👻 トリック・オア・キュート賞", "Amazonギフトカード 5,000円分1名様"],
      ["🪄 マジカル・アイデア賞", "Amazonギフトカード 5,000円分1名様"],
      ["🌙 ミッドナイト・マジック賞", "Amazonギフトカード 5,000円分1名様"],
      ["🎃 ハロウィン・セレクション賞", "ペルコイン 200枚30名様"],
    ]);
    const winners = HALLOWEEN_BEST_SHOT.prizes.reduce((sum, prize) => sum + Number.parseInt(prize.winners, 10), 0);
    expect(winners).toBe(34);
    // 前の賞(最優秀賞・優秀賞)は残さない
    expect(document.body.textContent).not.toMatch(/最優秀賞|優秀賞/);
  });

  test("賞のサムネイルは、ユーザーが用意した賞ごとの画像(10/15。つくる人5つ・つかう人2つ)。ファイルがあり、仮置きではない", () => {
    const srcs = [...HALLOWEEN_BEST_SHOT.prizes, ...HALLOWEEN_BEST_SHOT.userPrizes].map((prize) => prize.thumb.src);
    expect(new Set(srcs).size).toBe(7);
    for (const src of srcs) {
      expect(src).toMatch(/^\/campaigns\/halloween-best-shot\/prize-[a-z-]+\.jpg$/);
      expect(fs.existsSync(path.join(process.cwd(), "public", src))).toBe(true);
    }
    render(<HalloweenBestShotPage />);
    for (const item of screen.getAllByTestId("halloween-user-prize")) {
      expect(within(item).getByRole("img").getAttribute("alt")).toBeTruthy();
    }
  });

  test("つくる人の賞は見本どおり、サムネイル(説明つき)・説明・評価を出す。セレクション賞はねらいと評価なし", () => {
    render(<HalloweenBestShotPage />);
    const items = screen.getAllByTestId("halloween-prize");
    for (const item of items) {
      expect(within(item).getByRole("img").getAttribute("alt")).toBeTruthy();
    }
    const [best, , , midnight, selection] = items;
    expect(best.textContent).toContain("総合評価・最高賞");
    expect(best.textContent).toContain(
      "ハロウィンの世界観、キャラクターの魅力、構図、演出など、総合的に最も印象に残る作品。",
    );
    expect(best.textContent).toContain("評価：世界観・完成度・インパクト");
    expect(midnight.textContent).toContain("評価：幻想的な美しさ・色彩・光の演出・世界観");
    expect(selection.textContent).toContain("ハロウィンの魅力を感じる、素敵な作品30点を選出。");
    expect(selection.textContent).not.toContain("評価：");
  });

  test("つかう人の賞(抽選)は、ハロウィン・マスター賞 Amazonギフトカード 1,000円分 10名様／トリック・オア・コイン賞 ペルコイン 200枚 30名様(10/15)", () => {
    render(<HalloweenBestShotPage />);
    const items = screen.getAllByTestId("halloween-user-prize");
    expect(
      items.map((item) => [
        within(item).getByRole("heading", { level: 4 }).textContent,
        within(item).getByTestId("halloween-prize-gift").textContent,
      ]),
    ).toEqual([
      ["🏆 ハロウィン・マスター賞", "Amazonギフトカード 1,000円分10名様"],
      ["🪙 トリック・オア・コイン賞", "ペルコイン 200枚30名様"],
    ]);
    const [master, coin] = items;
    expect(master.textContent).toContain("たくさんのプロンプトを楽しんだ利用者へ");
    expect(master.textContent).toContain(
      "みんなが投稿したハロウィンのプロンプトを使って、たくさんの「うちの子」のベストショットを生み出してくれた方に、抽選で贈られる賞です！🎃",
    );
    expect(coin.textContent).toContain("ハロウィンのプロンプトを楽しんでくれた利用者へ");
    expect(coin.textContent).toContain(
      "ハロウィンのプロンプトを使って、イベントを一緒に盛り上げてくれた方に、抽選で贈られる賞です！✨",
    );
    // 抽選なので評価は書かない
    expect(master.textContent).not.toContain("評価：");
    expect(coin.textContent).not.toContain("評価：");
    // ねらいの「|」は折り返してよい位置の印で、画面には出さない
    expect(document.body.textContent).not.toContain("|");
    expect(screen.getByText("※ つくる人の賞とつかう人の賞の、両方には当選しません")).toBeTruthy();
  });

  test("冒頭の「総額」は、つくる人とつかう人の Amazonギフトカードの合計(25,000円＋10,000円＝3.5万円。ペルコインは入れない)", () => {
    const yen = (amount: string, winners: string) =>
      Number(amount.replace(/,/g, "")) * Number.parseInt(winners, 10);
    const amazonYen = (prizes: readonly { gift: string; amount: string; winners: string }[]) =>
      prizes
        .filter((prize) => prize.gift === "Amazonギフトカード")
        .reduce((sum, prize) => sum + yen(prize.amount, prize.winners), 0);
    expect([amazonYen(HALLOWEEN_BEST_SHOT.prizes), amazonYen(HALLOWEEN_BEST_SHOT.userPrizes)]).toEqual([
      25_000, 10_000,
    ]);
    render(<HalloweenBestShotPage />);
    expect(document.body.textContent).toContain("Amazonギフトカード 総額3.5万円");
    // 呼び名は「Amazonギフトカード」にそろえる(ユーザーの文と同じ)。賞品をまとめて言い切る注意も出さない
    expect(document.body.textContent).not.toContain("ギフト券");
  });

  test("セクションの見出しは文字のまま(読み上げ・翻訳のため画像にしない)", () => {
    render(<HalloweenBestShotPage />);
    const names = screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent);
    expect(names).toEqual([
      "ABOUT企画について",
      "PRIZE賞品",
      "HOW TO JOIN参加方法",
      "SCHEDULEスケジュール",
      "MOREその他",
      "あなたのベストショット、待ってます",
    ]);
  });

  test("ガチャプロンプトも対象(10/15 に変更)。対象外の注意は出さず、手順で「ガチャでもOK」と書く", () => {
    render(<HalloweenBestShotPage />);
    expect(screen.queryByText("※ ガチャプロンプトは対象外です")).toBeNull();
    const steps = screen.getAllByTestId("halloween-join-step-creator");
    expect(steps[3].textContent).toContain("ガチャプロンプトでもOKです");
    expect(steps[3].textContent).not.toContain("オフのままにしてください");
  });

  test("賞品の注意: つかう人の賞はエントリーした人から抽選・1人1アカウント・不正は対象外", () => {
    render(<HalloweenBestShotPage />);
    const prize = screen.getByRole("region", { name: /賞品/ });
    expect(prize.textContent).toContain("※ つかう人の賞は、エントリーした人の中から抽選します");
    expect(prize.textContent).toContain("※ 1人1アカウントでご参加ください。不正な参加は対象外です");
  });

  test("エントリー(進捗カード)は「つかう人」タブの手順1の中だけに置く(10/15 に独立した区画から移動)", () => {
    render(<HalloweenBestShotPage />);
    // 独立した「ENTRY」の区画は無い
    expect(screen.queryByRole("region", { name: /^ENTRY/ })).toBeNull();
    // ページに1つだけで、「つかう人」タブの中にある(タブは隠れていても描かれている)
    const cards = screen.getAllByTestId("halloween-entry-loading");
    expect(cards).toHaveLength(1);
    expect(cards[0].closest('[role="tabpanel"]')?.hasAttribute("hidden")).toBe(true);
    // 最初の「つくる人」タブでは見えない
    expect(within(screen.getByRole("tabpanel", { name: /つくる人/ })).queryByTestId("halloween-entry-loading")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /つかう人/ }));
    const panel = screen.getByRole("tabpanel", { name: /つかう人/ });
    const steps = within(panel).getAllByTestId("halloween-join-step-user");
    expect(within(steps[0]).getByTestId("halloween-entry-loading")).toBeTruthy();
  });

  test("画面の呼び名は「対象作品」にそろえる(「応募作」「キャンペーン対象の投稿」「投稿作品」「コンテンツ」を出さない。10/15)", () => {
    render(<HalloweenBestShotPage submissionPages={SUBMISSION_PAGES} />);
    // つくる人・つかう人の両方のタブの中身を見る(出ているタブの中身だけが描かれる)
    const creatorText = document.body.textContent ?? "";
    fireEvent.click(screen.getByRole("tab", { name: /つかう人/ }));
    const userText = document.body.textContent ?? "";
    for (const word of ["応募作", "キャンペーン対象の投稿", "投稿作品", "コンテンツ"]) {
      expect(creatorText).not.toContain(word);
      expect(userText).not.toContain(word);
    }
    const alts = Array.from(document.querySelectorAll("img")).map((img) => img.getAttribute("alt") ?? "");
    expect(alts.join("|")).not.toContain("応募作");
  });

  test("応募作がまだないあいだは「キャンペーン対象作品」を出さない", () => {
    render(<HalloweenBestShotPage submissionPages={[]} />);
    expect(screen.queryByRole("region", { name: /キャンペーン対象作品/ })).toBeNull();
    expect(screen.queryByTestId("halloween-works")).toBeNull();
  });

  test("応募作があれば、いちばん上(企画についての上)に「キャンペーン対象作品」を出す", () => {
    render(<HalloweenBestShotPage submissionPages={SUBMISSION_PAGES} />);
    const names = screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent);
    expect(names.slice(0, 3)).toEqual(["WORKSキャンペーン対象作品", "ABOUT企画について", "PRIZE賞品"]);
    const works = screen.getByRole("region", { name: /キャンペーン対象作品/ });
    expect(within(works).getAllByTestId("halloween-work")).toHaveLength(2);
    expect(within(works).getByRole("link", { name: /かぼちゃ/ }).getAttribute("href")).toBe("/posts/p1");
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
