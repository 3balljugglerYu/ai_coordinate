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
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }));

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

  /*
    2026-10-16 ユーザー指示: 参加のボタンは「カタログをつくる」「カタログから生成する」にし、
    ページのどこでも押せるよう画面の下に浮かせる(冒頭と締めに置いていたボタンはやめた)。
  */
  test("参加のボタン「カタログをつくる」は CREATE(/free) へ行く(画面の下に浮かせた1か所だけ)", () => {
    render(<HalloweenBestShotPage />);
    const links = screen.getAllByRole("link", { name: /カタログを\s*つくる/ });
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("/free");
    const floating = screen.getByTestId("halloween-floating-cta");
    expect(floating.contains(links[0])).toBe(true);
    // 前の呼び名は出さない
    expect(document.body.textContent).not.toContain("CREATEで参加する");
    expect(document.body.textContent).not.toContain("対象作品をつかう");
    // 冒頭(企画名の区画)にはボタンを置かない
    expect(screen.getByRole("banner").querySelector("a[href='/free']")).toBeNull();
  });

  test("浮いたボタンは、ページの終わりの目印(この下はサイト共通の案内)を持つ", () => {
    render(<HalloweenBestShotPage />);
    const floating = screen.getByTestId("halloween-floating-cta");
    expect(floating.tagName).toBe("NAV");
    expect(floating.getAttribute("aria-label")).toBe("企画に参加する");
    expect(document.getElementById("hbs-page-end")).toBeTruthy();
  });

  test("「カタログから生成する」は、みんなのカタログの企画のタブへ行く(10/16 ユーザー指示。ハッシュタグの検索ではなく)", () => {
    for (const submissionPages of [[], SUBMISSION_PAGES]) {
      const { unmount } = render(<HalloweenBestShotPage submissionPages={submissionPages} />);
      const links = screen.getAllByRole("link", { name: /カタログから\s*生成する/ });
      expect(links).toHaveLength(1);
      expect(links[0].getAttribute("href")).toBe("/user-styles?campaign=halloween-best-shot");
      expect(HALLOWEEN_BEST_SHOT.catalogHref).toBe(`/user-styles?campaign=${HALLOWEEN_BEST_SHOT.campaignKey}`);
      unmount();
    }
  });

  test("対象作品がまだ一覧に無いとき、手順2の「対象作品を見る」は、ハッシュタグの検索へ行く", () => {
    render(<HalloweenBestShotPage />);
    fireEvent.click(screen.getByRole("tab", { name: /エンジョイ\s*部門/ }));
    expect(screen.getByRole("link", { name: /対象作品を見る/ }).getAttribute("href")).toBe(HALLOWEEN_BEST_SHOT.entriesHref);
  });

  test("一覧に対象作品があるときは、手順2の「対象作品を見る」は、ページの中の一覧へ行く(10/15)", () => {
    render(<HalloweenBestShotPage submissionPages={SUBMISSION_PAGES} />);
    fireEvent.click(screen.getByRole("tab", { name: /エンジョイ\s*部門/ }));
    expect(screen.getByRole("link", { name: /対象作品を見る/ }).getAttribute("href")).toBe("#hbs-works");
    // 飛び先(一覧の見出し)がある
    expect(document.getElementById("hbs-works")).toBeTruthy();
  });

  test("企画について(10/16 ユーザーの文): カタログ化の説明・プロンプトは非公開のまま使ってもらえる・ベストショットをカタログ化・使った人にも当たるチャンス", () => {
    render(<HalloweenBestShotPage />);
    const about = screen.getByRole("region", { name: /企画について/ });
    const paragraphs = Array.from(about.querySelectorAll("p"));
    expect(paragraphs.map((node) => node.textContent)).toEqual([
      "🎃 知っていますか！？",
      "ペルスタでは、ほかのユーザーさんが作ったプロンプトを使って、自分の「うちの子」のイラストを生成できるんです！✨",
      "これが 「カタログ化」！作成したプロンプトは非公開のまま、みんなに利用してもらえます！🙌",
      "👉 作成者のメリットはこちら",
      "今回のテーマは 「ハロウィン」 🎃",
      "とっておきの「ベストショット」をカタログ化してみんなに使ってもらおう！✨",
      "🏆 選ばれた方にはAmazonギフトカードをプレゼント！ 🎁",
      "さらに、カタログを使って生成した方にも当たるチャンス！🎉",
      "作る人も、使う人も楽しめるハロウィン企画です！ 🎃",
    ]);
    // 「これが「カタログ化」！」のあとは、ユーザーの文どおり同じ段落の中で改行する
    expect(paragraphs[2].querySelectorAll("br")).toHaveLength(1);
  });

  test("企画についての目立たせる言葉: カタログ化は大切なポイントなので2か所とも。大事な文には下線(文末の絵文字ごと)", () => {
    render(<HalloweenBestShotPage />);
    const about = screen.getByRole("region", { name: /企画について/ });
    expect(Array.from(about.querySelectorAll("strong")).map((node) => node.textContent)).toEqual([
      "「カタログ化」",
      "作成したプロンプトは非公開のまま、みんなに利用してもらえます！🙌",
      "「ハロウィン」",
      "カタログ化",
      "選ばれた方にはAmazonギフトカードをプレゼント！ 🎁",
      "カタログを使って生成した方にも当たるチャンス！🎉",
    ]);
  });

  test("企画についての「作成者のメリットはこちら」は、プロンプト利用の案内(/use-prompts)へ行く", () => {
    render(<HalloweenBestShotPage />);
    const link = screen.getByRole("link", { name: "作成者のメリットはこちら" });
    expect(link.getAttribute("href")).toBe("/use-prompts");
  });

  test("参加方法は「クリエイティブ部門」「エンジョイ部門」のタブで、最初はクリエイティブ部門を出す", () => {
    render(<HalloweenBestShotPage />);
    const creatorTab = screen.getByRole("tab", { name: /クリエイティブ\s*部門/ });
    const userTab = screen.getByRole("tab", { name: /エンジョイ\s*部門/ });
    expect(creatorTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel", { name: /クリエイティブ\s*部門/ })).toBeTruthy();
    expect(screen.queryByRole("tabpanel", { name: /エンジョイ\s*部門/ })).toBeNull();

    fireEvent.click(userTab);
    expect(userTab.getAttribute("aria-selected")).toBe("true");
    expect(creatorTab.getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tabpanel", { name: /エンジョイ\s*部門/ })).toBeTruthy();
    expect(screen.queryByRole("tabpanel", { name: /クリエイティブ\s*部門/ })).toBeNull();
  });

  test("参加方法のタブは、賞品の部門と同じ呼び名とアイコンだけ。画面に「つくる人」「つかう人」とは書かない(10/15 統一感のため)", () => {
    render(<HalloweenBestShotPage />);
    const tabs = screen.getAllByRole("tab");
    // タブは部門の名前だけ(下の小さな説明は 10/15 ユーザー指示で出さない)
    expect(tabs.map((tab) => tab.textContent)).toEqual(["🎨クリエイティブ部門", "🎁エンジョイ部門"]);
    expect(document.body.textContent).not.toMatch(/つくる人|つかう人|つくる側|つかう側/);
  });

  test("タブは左右の矢印キーでも切り替えられる", () => {
    render(<HalloweenBestShotPage />);
    const creatorTab = screen.getByRole("tab", { name: /クリエイティブ\s*部門/ });
    fireEvent.keyDown(creatorTab, { key: "ArrowRight" });
    const userTab = screen.getByRole("tab", { name: /エンジョイ\s*部門/ });
    expect(userTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(userTab);
    fireEvent.keyDown(userTab, { key: "ArrowRight" });
    expect(creatorTab.getAttribute("aria-selected")).toBe("true");
  });

  test("エンジョイ部門の手順は7つで、最初にエントリー。対象作品をさがす入口と口数の表がある", () => {
    render(<HalloweenBestShotPage />);
    fireEvent.click(screen.getByRole("tab", { name: /エンジョイ\s*部門/ }));
    const steps = screen.getAllByTestId("halloween-join-step-user");
    expect(steps).toHaveLength(7);
    expect(within(steps[0]).getByRole("heading", { name: "エントリーする" })).toBeTruthy();
    // エントリーのカードは、10/16 から手順の外(ひとことのすぐ下)。手順1は上のカードを指す
    expect(within(steps[0]).queryByTestId("halloween-entry-loading")).toBeNull();
    expect(steps[0].textContent).toContain("上のカードの「エントリーする」をタップします。");
    const entries = within(steps[1]).getByRole("link", { name: /対象作品を見る/ });
    expect(entries.getAttribute("href")).toBe(HALLOWEEN_BEST_SHOT.entriesHref);
    expect(within(steps[2]).getAllByTestId("shot-ring")).toHaveLength(1);
    // 手順3の画像は、フォロー済みの人が見る今の画面(「このカタログで生成する」)。10/15 に差し替え。
    // 10/16 に対象作品のボタンがハロウィン仕様になったので撮り直した(v2)
    const step3Image = within(steps[2]).getByRole("img");
    expect(step3Image.getAttribute("alt")).toContain("「このカタログで生成する」のボタン");
    expect(step3Image.getAttribute("alt")).toContain("ハロウィン仕様(紫からオレンジ)");
    const step3Src = step3Image.getAttribute("src") ?? "";
    expect(step3Src).toBe("/campaigns/halloween-best-shot/use-3-catalog-button-v2.webp");
    expect(fs.existsSync(path.join(process.cwd(), "public", step3Src))).toBe(true);
    expect(within(steps[6]).getByTestId("halloween-tickets").textContent).toBe("3作品▶1口6作品▶2口10作品▶3口");
    const panel = screen.getByRole("tabpanel", { name: /エンジョイ\s*部門/ });
    expect(panel.textContent).toContain("自分の対象作品を使った投稿は数えません");
    expect(panel.textContent).toContain("何回使っても1作品");
    expect(panel.textContent).toContain("※ 抽選はエントリーした人が対象です(エントリー前の投稿も数えます)");
  });

  test("クリエイティブ部門の参加方法は9つの手順で、画面のスクショに押す場所の枠を重ねる", () => {
    render(<HalloweenBestShotPage />);
    const steps = screen.getAllByTestId("halloween-join-step-creator");
    expect(steps).toHaveLength(9);
    expect(within(steps[0]).getAllByTestId("shot-ring")).toHaveLength(1);
    expect(within(steps[7]).getByRole("button", { name: "コピーする" })).toBeTruthy();
    expect(within(steps[7]).getByText(HALLOWEEN_BEST_SHOT.hashtag)).toBeTruthy();
    // 投稿の画面は、箇条の番号と同じ数だけ赤枠を付ける
    expect(within(steps[7]).getAllByRole("listitem")).toHaveLength(3);
    expect(within(steps[7]).getAllByTestId("shot-ring")).toHaveLength(3);
    // 10/16: 期間中は投稿画面のタグ候補に企画のタグが出る(#753)ので、その行が写った画像(v3)にした
    const postFormImage = steps[7].querySelector("img");
    const postFormSrc = postFormImage?.getAttribute("src") ?? "";
    expect(postFormSrc).toBe("/campaigns/halloween-best-shot/join-8-post-form-v3.jpg");
    expect(fs.existsSync(path.join(process.cwd(), "public", postFormSrc))).toBe(true);
    expect(postFormImage?.getAttribute("alt")).toContain("タグ候補「#うちの子のベストショット」");
    expect(steps[7].textContent).toContain("タップで入る");
  });

  test("エンジョイ部門の手順2: 対象作品のラベルが目印だと書き、ラベルの見本の画像を出す(10/16 ユーザー指示)", () => {
    render(<HalloweenBestShotPage />);
    fireEvent.click(screen.getByRole("tab", { name: /エンジョイ\s*部門/ }));
    const steps = screen.getAllByTestId("halloween-join-step-user");
    expect(steps[1].querySelector("p")?.textContent).toContain(
      `画像の左上の「${HALLOWEEN_BEST_SHOT.targetBadgeLabel}」のラベルが目印です。`,
    );
    // 「対象作品を見る」はそのまま
    expect(within(steps[1]).getByRole("link", { name: /対象作品を見る/ })).toBeTruthy();
    const image = steps[1].querySelector("img");
    const src = image?.getAttribute("src") ?? "";
    // 10/16: 絵をハロウィンのイラストに差し替えた(v2)
    expect(src).toBe("/campaigns/halloween-best-shot/use-2-target-badge-v2.webp");
    expect(fs.existsSync(path.join(process.cwd(), "public", src))).toBe(true);
    expect(image?.getAttribute("alt")).toContain("「ハロウィン企画対象！」のラベル");
    expect(within(steps[1]).getAllByTestId("shot-ring")).toHaveLength(1);
    expect(steps[1].textContent).toContain("これが目印");
  });

  test("審査のポイントは3つ(ハロウィンらしさ・うちの子らしさ・使ってみたくなる魅力。安定性は 10/14 に削除)", () => {
    render(<HalloweenBestShotPage />);
    const names = screen
      .getAllByTestId("halloween-judge-point")
      .map((point) => point.querySelector("b")?.textContent);
    expect(names).toEqual(["ハロウィンらしさ", "うちの子らしさ", "使ってみたくなる魅力"]);
  });

  test("審査のポイントは「クリエイティブ部門」のタブの中だけに出す(審査があるのはクリエイティブ部門だけ。10/14 に独立した区画から移動)", () => {
    render(<HalloweenBestShotPage />);
    const creatorPanel = screen.getByRole("tabpanel", { name: /クリエイティブ\s*部門/ });
    expect(within(creatorPanel).getByRole("heading", { name: "審査のポイント" })).toBeTruthy();
    expect(within(creatorPanel).getAllByTestId("halloween-judge-point")).toHaveLength(3);
    // ページ全体でも3つだけ(エンジョイ部門のタブや、ほかの区画には出さない)
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

  test("クリエイティブ部門(つくる側の賞)は5つ・計34名様(10/15 ユーザー決定)。賞の名前の順と、賞品・人数", () => {
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

  test("賞のサムネイルは、ユーザーが用意した賞ごとの画像(10/15。クリエイティブ部門5つ・エンジョイ部門2つ)。ファイルがあり、仮置きではない", () => {
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

  test("クリエイティブ部門は見本どおり、サムネイル(説明つき)・説明・評価を出す。セレクション賞はねらいと評価なし", () => {
    render(<HalloweenBestShotPage />);
    const items = screen.getAllByTestId("halloween-prize");
    for (const item of items) {
      expect(within(item).getByRole("img").getAttribute("alt")).toBeTruthy();
    }
    const [best, , idea, midnight, selection] = items;
    expect(best.textContent).toContain("総合評価・最高賞");
    expect(best.textContent).toContain(
      "ハロウィンの世界観、キャラクターの魅力、構図、演出など、総合的に最も印象に残る作品。",
    );
    expect(best.textContent).toContain("評価：世界観・完成度・インパクト");
    expect(midnight.textContent).toContain("評価：幻想的な美しさ・色彩・光の演出・世界観");
    // 10/15 ユーザー指示: セレクション賞の説明は数(30点)を書かない。マジカル・アイデア賞の評価は「表現の工夫」
    expect(selection.textContent).toContain(
      "ハロウィンの魅力を感じる、素敵な作品を選出。特別賞に次ぐ入選作品として、そのアイデアと創意工夫を称え、賞を贈ります。",
    );
    expect(idea.textContent).toContain("評価：独創性・意外性・表現の工夫");
    expect(selection.textContent).not.toContain("評価：");
  });

  test("賞品は部門に分ける: 🎨 クリエイティブ部門(全5賞)・🎁 エンジョイ部門(全2賞)と、それぞれのひとこと(10/15 ユーザー決定)", () => {
    render(<HalloweenBestShotPage />);
    const prizeSection = screen.getByRole("region", { name: /賞品/ });
    expect(within(prizeSection).getAllByRole("heading", { level: 3 }).map((node) => node.textContent)).toEqual([
      "🎨 クリエイティブ部門（全5賞）",
      "🎁 エンジョイ部門（全2賞）",
    ]);
    // 「全○賞」は並べた賞の数と合う
    expect(screen.getAllByTestId("halloween-prize")).toHaveLength(5);
    expect(screen.getAllByTestId("halloween-user-prize")).toHaveLength(2);
    expect(prizeSection.textContent).toContain("ハロウィンをテーマに、あなただけの素敵な作品をつくって投稿しよう！🎃");
    expect(prizeSection.textContent).toContain(
      "みんなが投稿した作品を使って、自分の「うちの子」のハロウィンイラストを楽しもう！✨",
    );
    // 前の見出し(つくる側の賞・つかう側の賞)は残さない
    expect(prizeSection.textContent).not.toMatch(/つくる側の賞|つかう側の賞/);
  });

  test("エンジョイ部門(つかう側の賞・抽選)は、ハロウィン・マスター賞 Amazonギフトカード 1,000円分 10名様／トリック・オア・コイン賞 ペルコイン 200枚 30名様(10/15)", () => {
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
    expect(master.textContent).toContain("たくさんの対象作品を楽しんでくれた利用者へ");
    expect(master.textContent).toContain(
      "みんなが投稿したハロウィンの対象作品を使って、たくさんの「うちの子」のベストショットを生み出してくれた方に、抽選で贈られる賞です！🎃",
    );
    expect(coin.textContent).toContain("ハロウィンの対象作品を楽しんでくれた利用者へ");
    expect(coin.textContent).toContain(
      "ハロウィンの対象作品を使って、イベントを一緒に盛り上げてくれた方に、抽選で贈られる賞です！✨",
    );
    // つかう側が使うのは対象作品なので、ねらいと説明に「プロンプト」と書かない(10/15)
    expect(master.textContent).not.toContain("プロンプト");
    expect(coin.textContent).not.toContain("プロンプト");
    // 抽選なので評価は書かない
    expect(master.textContent).not.toContain("評価：");
    expect(coin.textContent).not.toContain("評価：");

    // ねらいの「|」は折り返してよい位置の印で、画面には出さない
    expect(document.body.textContent).not.toContain("|");
  });

  test("冒頭の「総額」は、クリエイティブ部門とエンジョイ部門の Amazonギフトカードの合計を「○○円分」で書く(25,000円＋10,000円。ペルコインは入れない)", () => {
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
    // 金額は「○○円分」と書く(10/16 ユーザー提供の注意事項。「3.5万円」はやめた)
    expect(document.body.textContent).toContain("Amazonギフトカード 総額35,000円分");
    expect(document.body.textContent).not.toContain("3.5万円");
    // 呼び名は「Amazonギフトカード」にそろえる(ユーザーの文と同じ)。賞品をまとめて言い切る注意も出さない
    expect(document.body.textContent).not.toContain("ギフト券");
  });

  test("Amazonギフトカードの書き方(10/16 ユーザー提供の注意事項): 略称を使わず、全員もらえるように読める言い方をしない", () => {
    render(<HalloweenBestShotPage />);
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("アマギフ");
    expect(text).not.toMatch(/GETしよう|ゲットしよう/);
    expect(screen.getByText("あなたの“うちの子”が一番かがやくハロウィンをペルスタに投稿して、Amazonギフトカードを当てよう！")).toBeTruthy();
  });

  test("ページのいちばん下に、Amazon の決まった注記2つと、問い合わせ先(お問い合わせフォーム)を出す", () => {
    render(<HalloweenBestShotPage />);
    const notice = screen.getByTestId("amazon-gift-card-notice");
    expect(Array.from(notice.querySelectorAll("p")).map((node) => node.textContent)).toEqual([
      "本キャンペーンはPersta.AIによる提供です。本キャンペーンについてのお問い合わせはAmazonではお受けしておりません。Persta.AIキャンペーン事務局（お問い合わせフォーム）までお願いいたします。",
      "Amazon、Amazon.co.jpおよびそれらのロゴはAmazon.com, Inc.またはその関連会社の商標です。",
    ]);
    expect(within(notice).getByRole("link", { name: "お問い合わせフォーム" }).getAttribute("href")).toBe(
      "/my-page/contact",
    );
    // 閉じの帯(いちばん下)の中に置く
    expect(screen.getByRole("region", { name: "あなたのベストショット、待ってます" }).contains(notice)).toBe(true);
  });

  test("賞品の下は「※」の注意を並べず、応募規約へのリンクだけ(注意は応募規約に書いてある。10/16 ユーザー指示)", () => {
    render(<HalloweenBestShotPage />);
    const prizeSection = screen.getByRole("region", { name: /賞品/ });
    const notes = Array.from(prizeSection.querySelectorAll("p"))
      .map((node) => node.textContent ?? "")
      .filter((text) => text.startsWith("※"));
    expect(notes).toEqual([]);
    expect(within(prizeSection).getByRole("link", { name: "応募規約・注意事項を見る" }).getAttribute("href")).toBe(
      "/campaigns/halloween-best-shot/terms",
    );
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

  test("スケジュールの最後に、当選後の流れ(お知らせで当選のご連絡→賞品のお届け)を短く書く(2026-10-16 ユーザー指示: 詳細は書かず簡易的に)", () => {
    render(<HalloweenBestShotPage />);
    const schedule = screen.getByRole("region", { name: /スケジュール/ });
    expect(within(schedule).getAllByRole("listitem").map((node) => node.textContent)).toEqual([
      "10/16(金) 20:00募集スタート",
      "10/31(土) 23:59募集締め切り",
      "終了後 1週間程度結果発表（特設ページで作品とクリエイターをご紹介）",
      "結果発表のあと当選のご連絡（ペルスタ内のお知らせでお送りします）",
      "ご連絡のあと賞品のお届け",
    ]);
  });

  test("ガチャプロンプトも対象(10/15 に変更)。対象外の注意は出さず、手順で「ガチャでもOK」と書く", () => {
    render(<HalloweenBestShotPage />);
    expect(screen.queryByText("※ ガチャプロンプトは対象外です")).toBeNull();
    const steps = screen.getAllByTestId("halloween-join-step-creator");
    expect(steps[3].textContent).toContain("ガチャプロンプトでもOKです");
    expect(steps[3].textContent).not.toContain("オフのままにしてください");
  });

  test("エンジョイ部門の手順の題名と画像(10/15 ユーザー指示: 手順4・5の絵を差し替え、手順6はカウントの確認、手順7は当選率アップ)", () => {
    render(<HalloweenBestShotPage />);
    const steps = screen.getAllByTestId("halloween-join-step-user");
    // 題名の「|」は折り返しの印で、文字には出ない
    expect(steps.map((step) => step.querySelector("h3")?.textContent)).toEqual([
      "エントリーする",
      "対象作品をさがす",
      "「このカタログで生成する」をタップ",
      "うちの子の画像を入れて生成",
      "できあがったら「投稿」をタップ",
      "カウントが増えていることを確認！",
      "ちがう対象作品で、当選率アップ！",
    ]);
    // タブは隠れていても描かれている。役割(role)で探すと隠れた中身は除かれるので、要素で見る
    const src = (index: number) => steps[index].querySelector("img")?.getAttribute("src") ?? "";
    expect([src(3), src(4), src(5)]).toEqual([
      "/campaigns/halloween-best-shot/use-4-upload.webp",
      "/campaigns/halloween-best-shot/use-5-post.jpg",
      "/campaigns/halloween-best-shot/use-6-count.webp",
    ]);
    for (const index of [3, 4, 5]) {
      expect(fs.existsSync(path.join(process.cwd(), "public", src(index)))).toBe(true);
    }
    expect(steps[5].textContent).toContain("上のエントリーのカードでカウントが増えていることを確かめましょう");
    expect(steps[5].textContent).toContain("ハッシュタグを付けなくても自動で数えます");
    // 「投稿してペルコインもGET！」の手順はやめた
    expect(document.body.textContent).not.toContain("ペルコインもGET");
    // クリエイティブ部門の「投稿」の画像は今のまま(エンジョイ部門だけ絵を差し替えた)
    const creatorPost = screen
      .getAllByTestId("halloween-join-step-creator")
      .find((step) => step.querySelector("h3")?.textContent === "「投稿」をタップ");
    expect(creatorPost?.querySelector("img")?.getAttribute("src")).toBe(
      "/campaigns/halloween-best-shot/join-7-post.jpg",
    );
  });

  test("エンジョイ部門の手順4の文: 文字入力の欄の一文は出さない(10/16 ユーザー指示)", () => {
    render(<HalloweenBestShotPage />);
    const steps = screen.getAllByTestId("halloween-join-step-user");
    expect(steps[3].querySelector("p")?.textContent).toBe(
      "うちの子の画像を選んで「コーデ開始！」をタップします。プロンプトの中身が伏せられていても大丈夫。",
    );
    expect(document.body.textContent).not.toContain("好きな文字も入れられます");
  });

  test("口数の表は、参加方法のエンジョイ部門の手順の中だけ。賞品の区画には出さない(同じ表が二重になるため。10/15)", () => {
    render(<HalloweenBestShotPage />);
    const prizeSection = screen.getByRole("region", { name: /賞品/ });
    expect(within(prizeSection).queryByTestId("halloween-tickets")).toBeNull();
    expect(prizeSection.textContent).not.toContain("当たりやすく");
    // ページ全体で1つだけ(エンジョイ部門のタブの中。タブは隠れていても描かれている)
    const tables = screen.getAllByTestId("halloween-tickets");
    expect(tables).toHaveLength(1);
    expect(screen.getByRole("tabpanel", { name: /クリエイティブ\s*部門/ }).contains(tables[0])).toBe(false);
  });

  test("エントリー(進捗カード)は「エンジョイ部門」タブの、ひとことのすぐ下に置く(閉じた作成手順の外。10/16)", () => {
    render(<HalloweenBestShotPage />);
    // 独立した「ENTRY」の区画は無い
    expect(screen.queryByRole("region", { name: /^ENTRY/ })).toBeNull();
    // ページに1つだけで、「エンジョイ部門」タブの中にある(タブは隠れていても描かれている)
    const cards = screen.getAllByTestId("halloween-entry-loading");
    expect(cards).toHaveLength(1);
    expect(cards[0].closest('[role="tabpanel"]')?.hasAttribute("hidden")).toBe(true);
    // 最初の「クリエイティブ部門」タブでは見えない
    expect(within(screen.getByRole("tabpanel", { name: /クリエイティブ\s*部門/ })).queryByTestId("halloween-entry-loading")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /エンジョイ\s*部門/ }));
    const panel = screen.getByRole("tabpanel", { name: /エンジョイ\s*部門/ });
    const card = within(panel).getByTestId("halloween-entry-loading");
    // ⭐ 抽選はエントリーした人だけなので、作成手順を閉じたままでもエントリーできる場所に置く
    expect(card.closest("details")).toBeNull();
    const steps = within(panel).getAllByTestId("halloween-join-step-user");
    expect(within(steps[0]).queryByTestId("halloween-entry-loading")).toBeNull();
    expect(steps[0].querySelector("p")?.textContent).toBe("上のカードの「エントリーする」をタップします。");
  });

  /*
    2026-10-16 ユーザー指示: いきなり作成手順を見せると嫌気がさすので、まずひとことで伝え、
    詳しい作成手順は「詳細な作成手順はこちら！」で開く。ひとことはユーザーの文のまま。
    数えてもらうのに欠かせない条件(ハッシュタグ・エントリー)だけ、下に小さく添える。
  */
  test("参加方法: クリエイティブ部門は、ひとこと・ハッシュタグ・閉じた作成手順・審査のポイントの順", () => {
    render(<HalloweenBestShotPage />);
    const panel = screen.getByRole("tabpanel", { name: /クリエイティブ\s*部門/ });
    const summary = within(panel).getByTestId("halloween-join-summary");
    expect(summary.querySelector("p")?.textContent).toBe("「カタログをつくる」から生成して投稿するだけでOK！");
    expect(summary.textContent).toContain("※ 投稿のときに、このハッシュタグを付けてね");
    expect(within(summary).getByText(HALLOWEEN_BEST_SHOT.hashtag)).toBeTruthy();
    expect(within(summary).getByRole("button", { name: "コピーする" })).toBeTruthy();
    const details = within(panel).getByTestId("halloween-join-details") as HTMLDetailsElement;
    // 最初は閉じている
    expect(details.open).toBe(false);
    expect(details.querySelector("summary")?.textContent).toContain("詳細な作成手順はこちら！");
    // 9つの作成手順はすべて閉じた中にある
    const steps = within(panel).getAllByTestId("halloween-join-step-creator");
    expect(steps).toHaveLength(9);
    steps.forEach((step) => expect(details.contains(step)).toBe(true));
    // 審査のポイントは作成手順ではないので、閉じずに見せる
    const judgePoints = within(panel).getAllByTestId("halloween-judge-point");
    expect(judgePoints).toHaveLength(3);
    judgePoints.forEach((point) => expect(details.contains(point)).toBe(false));
    // 並び: ひとこと → 作成手順 → 審査のポイント
    expect(summary.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(details.compareDocumentPosition(judgePoints[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test("参加方法: エンジョイ部門は、ひとこと・エントリーのカード・閉じた作成手順の順", () => {
    render(<HalloweenBestShotPage />);
    fireEvent.click(screen.getByRole("tab", { name: /エンジョイ\s*部門/ }));
    const panel = screen.getByRole("tabpanel", { name: /エンジョイ\s*部門/ });
    const summary = within(panel).getByTestId("halloween-join-summary");
    expect(summary.querySelector("p")?.textContent).toBe("「カタログから生成する」から生成して投稿するだけでOK！");
    expect(summary.textContent).toContain("※ 抽選の対象になるには、下の「エントリーする」が必要です");
    const card = within(panel).getByTestId("halloween-entry-loading");
    const details = within(panel).getByTestId("halloween-join-details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.querySelector("summary")?.textContent).toContain("詳細な作成手順はこちら！");
    const steps = within(panel).getAllByTestId("halloween-join-step-user");
    expect(steps).toHaveLength(7);
    steps.forEach((step) => expect(details.contains(step)).toBe(true));
    // 注意書きも作成手順と一緒に閉じた中
    expect(details.textContent).toContain("※ 同じ対象作品は、何回使っても1作品と数えます");
    expect(summary.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test("画面の呼び名は「対象作品」にそろえる(「応募作」「キャンペーン対象の投稿」「投稿作品」「コンテンツ」を出さない。10/15)", () => {
    render(<HalloweenBestShotPage submissionPages={SUBMISSION_PAGES} />);
    // クリエイティブ部門・エンジョイ部門の両方のタブの中身を見る(出ているタブの中身だけが描かれる)
    const creatorText = document.body.textContent ?? "";
    fireEvent.click(screen.getByRole("tab", { name: /エンジョイ\s*部門/ }));
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

  test("エントリーは、対象作品の上に別の項目として置く(2026-10-25。手順1のカードも残す)", () => {
    render(<HalloweenBestShotPage submissionPages={SUBMISSION_PAGES} />);
    const entrySection = screen.getByRole("region", { name: /エントリー/ });
    const worksSection = screen.getByRole("region", { name: /キャンペーン対象作品/ });
    expect(entrySection.compareDocumentPosition(worksSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 対象作品の項目の中にはエントリーのカードを置かない
    expect(within(worksSection).queryByTestId("halloween-entry-loading")).toBeNull();
    // 読み込み中の骨組みが出ている(中身はエントリーのカード)
    expect(within(entrySection).getByTestId("halloween-entry-loading")).toBeTruthy();
    // 対象作品の項目は、見出し → 「タップして…」→ 数 → 作品の順
    const heading = within(worksSection).getByRole("heading", { level: 2 });
    const lead = within(worksSection).getByText("タップして、うちの子で生成してみよう！");
    const works = within(worksSection).getByTestId("halloween-works");
    expect(heading.compareDocumentPosition(lead) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(lead.compareDocumentPosition(works) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 進捗の読み込みは、カードが2枚あっても1回
    fireEvent.click(screen.getByRole("tab", { name: /エンジョイ\s*部門/ }));
    expect(screen.getAllByTestId("halloween-entry-loading")).toHaveLength(2);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("「タップして、うちの子で生成してみよう！」のすぐ下に、対象作品の数(全ページの合計)を出す(2026-10-25)", () => {
    const pages = [
      SUBMISSION_PAGES[0],
      [{ postId: "p3", thumbnailUrl: "https://img.test/p3.webp", authorName: "おばけ" }],
    ];
    render(<HalloweenBestShotPage submissionPages={pages} />);
    const section = screen.getByRole("region", { name: /キャンペーン対象作品/ });
    const lead = within(section).getByText("タップして、うちの子で生成してみよう！");
    const count = within(section).getByTestId("halloween-works-count");
    expect(lead.nextElementSibling).toBe(count);
    expect(count.textContent).toBe("現在、対象作品は3作品！");
    expect(count.querySelector("strong")?.textContent).toBe("3");
  });

  test("エントリーの項目の「詳しくはこちら」: エンジョイ部門のタブに切り替え、詳細な作成手順を開き、参加方法までスクロールする(2026-10-24)", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        startsAt: "2026-10-16T11:00:00.000Z",
        endsAt: "2026-10-31T15:00:00.000Z",
        viewer: { enteredAt: "2026-10-20T00:00:00.000Z", usedWorks: 4, celebratedTickets: 1 },
      }),
    })) as unknown as typeof fetch;
    const scrolled: Element[] = [];
    const scrollIntoView = jest.fn(function (this: Element) {
      scrolled.push(this);
    });
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      render(<HalloweenBestShotPage submissionPages={SUBMISSION_PAGES} />);
      const entry = screen.getByTestId("halloween-works-entry");
      const more = await within(entry).findByRole("button", { name: /詳しくはこちら/ });
      // 最初はクリエイティブ部門のタブ
      expect(screen.getByRole("tab", { name: /クリエイティブ\s*部門/ }).getAttribute("aria-selected")).toBe("true");

      act(() => {
        fireEvent.click(more);
      });

      expect(screen.getByRole("tab", { name: /エンジョイ\s*部門/ }).getAttribute("aria-selected")).toBe("true");
      const panel = screen.getByRole("tabpanel", { name: /エンジョイ\s*部門/ });
      const details = within(panel).getByTestId("halloween-join-details") as HTMLDetailsElement;
      expect(details.open).toBe(true);
      expect(scrolled).toEqual([document.getElementById("hbs-join")]);
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
      // クリエイティブ部門の作成手順は開かない
      fireEvent.click(screen.getByRole("tab", { name: /クリエイティブ\s*部門/ }));
      const creatorPanel = screen.getByRole("tabpanel", { name: /クリエイティブ\s*部門/ });
      expect((within(creatorPanel).getByTestId("halloween-join-details") as HTMLDetailsElement).open).toBe(false);
      // 手順1のカードは短くしない(「詳しくはこちら」は上のカードだけ)
      expect(screen.getAllByRole("button", { name: /詳しくはこちら/ })).toHaveLength(1);
    } finally {
      // @ts-expect-error jsdom にはないので、置いたものを消す
      delete Element.prototype.scrollIntoView;
    }
  });

  test("応募作がまだないあいだは、対象作品の上のエントリーのカードも出さない(手順1のカードはある)", () => {
    render(<HalloweenBestShotPage submissionPages={[]} />);
    expect(screen.queryByTestId("halloween-works-entry")).toBeNull();
  });

  test("応募作があれば、いちばん上(企画についての上)に「エントリー」と「キャンペーン対象作品」を出す", () => {
    render(<HalloweenBestShotPage submissionPages={SUBMISSION_PAGES} />);
    const names = screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent);
    expect(names.slice(0, 4)).toEqual(["ENTRYエントリー", "WORKSキャンペーン対象作品", "ABOUT企画について", "PRIZE賞品"]);
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

/*
  2026-11-01 ユーザー指示: 企画が終わったので、ページを終わったあとの表示にする。
  参加方法は区画ごと隠し、対象作品の一覧は残す(どちらもユーザーの選択)。浮いたボタンと、対象作品の上のエントリーも出さない
*/
describe("企画が終わったあとの表示(ended)", () => {
  test("冒頭の開催期間の枠に「募集は終了しました」を足す。期間と結果発表の時期はそのまま", () => {
    render(<HalloweenBestShotPage submissionPages={SUBMISSION_PAGES} ended />);
    const header = screen.getByRole("banner");
    expect(within(header).getByTestId("halloween-period-ended").textContent).toBe("募集は終了しました");
    expect(header.textContent).toContain("10/16(金) 20:00 〜 10/31(土) 23:59");
    expect(header.textContent).toContain("結果発表：終了後 1週間程度");
  });

  test("冒頭の文は、投稿の呼びかけから終わったあとの文にする(2026-11-01 ユーザー決定)", () => {
    render(<HalloweenBestShotPage submissionPages={SUBMISSION_PAGES} ended />);
    const header = screen.getByRole("banner");
    expect(header.textContent).toContain(
      "“うちの子”が一番かがやくハロウィンの作品が、たくさん集まりました！結果発表をお楽しみに。",
    );
    expect(header.textContent).not.toContain("投稿して、Amazonギフトカードを当てよう！");
  });

  test("開催中は「募集は終了しました」を出さず、冒頭の文も呼びかけのまま", () => {
    render(<HalloweenBestShotPage submissionPages={SUBMISSION_PAGES} />);
    expect(screen.queryByTestId("halloween-period-ended")).toBeNull();
    expect(document.body.textContent).not.toContain("募集は終了しました");
    expect(screen.getByRole("banner").textContent).toContain(
      "あなたの“うちの子”が一番かがやくハロウィンをペルスタに投稿して、Amazonギフトカードを当てよう！",
    );
  });

  test("浮いたボタン・対象作品の上のエントリー・参加方法・その他を出さず、エントリーの状態も読みに行かない", () => {
    render(<HalloweenBestShotPage submissionPages={SUBMISSION_PAGES} ended />);
    expect(screen.queryByTestId("halloween-floating-cta")).toBeNull();
    // 浮いたボタンのための下の余白(ページの終わりの目印)も置かない
    expect(document.getElementById("hbs-page-end")).toBeNull();
    expect(screen.queryByTestId("halloween-works-entry")).toBeNull();
    expect(screen.queryByRole("region", { name: /参加方法/ })).toBeNull();
    // その他(Xへのシェア・運営の応援)は参加中の人への呼びかけなので出さない(2026-11-01 ユーザー決定)
    expect(screen.queryByRole("region", { name: /その他/ })).toBeNull();
    expect(screen.queryByTestId("halloween-more-tip")).toBeNull();
    expect(screen.queryByTestId("halloween-entry-card")).toBeNull();
    expect(screen.queryByTestId("halloween-entry-loading")).toBeNull();
    // 参加をうながすボタンと文が、ページのどこにも残っていない
    expect(screen.queryByRole("link", { name: /カタログを\s*つくる/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /カタログから\s*生成する/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "エントリーする" })).toBeNull();
    expect(document.body.textContent).not.toContain("「エントリーする」が必要です");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("対象作品の一覧は残し、文を「タップすると、作品を見られます」と「対象作品は○作品でした！」にする", () => {
    const pages = [
      SUBMISSION_PAGES[0],
      [{ postId: "p3", thumbnailUrl: "https://img.test/p3.webp", authorName: "おばけ" }],
    ];
    render(<HalloweenBestShotPage submissionPages={pages} ended />);
    const section = screen.getByRole("region", { name: /キャンペーン対象作品/ });
    const count = within(section).getByTestId("halloween-works-count");
    // 「タップして…」の場所(数のすぐ上)。お礼はいちばん下だけにして重ねない(2026-11-01 ユーザー決定)
    expect(count.previousElementSibling?.textContent).toBe("タップすると、作品を見られます");
    expect(section.textContent).not.toContain("ありがとうございました");
    expect(count.textContent).toBe("対象作品は3作品でした！");
    expect(count.querySelector("strong")?.textContent).toBe("3");
    // 一覧はそのまま(2ページで3作品。押すと投稿へ行ける)
    expect(within(section).getAllByTestId("halloween-work")).toHaveLength(3);
    expect(within(section).getByRole("link", { name: /かぼちゃ/ }).getAttribute("href")).toBe("/posts/p1");
    expect(section.textContent).not.toContain("タップして、うちの子で生成してみよう！");
    expect(section.textContent).not.toContain("現在、");
  });

  test("いちばん下の見出しはお礼にする(「待ってます」は出さない)。ハッシュタグと応募規約・Amazon の注記は残す", () => {
    render(<HalloweenBestShotPage submissionPages={SUBMISSION_PAGES} ended />);
    // 文節ごとの span の間に、テストの環境では空白が入って読まれる
    const closing = screen.getByRole("region", { name: /^たくさんの\s*ご参加、\s*ありがとう\s*ございました！$/ });
    expect(document.body.textContent).not.toContain("あなたのベストショット、待ってます");
    // スマホ幅で言葉の途中で折れないよう、文節の切れ目でだけ折り返す
    const title = within(closing).getByRole("heading", { level: 2 });
    expect(Array.from(title.querySelectorAll("span")).map((node) => node.textContent)).toEqual([
      "たくさんの",
      "ご参加、",
      "ありがとう",
      "ございました！",
    ]);
    expect(within(closing).getByText(HALLOWEEN_BEST_SHOT.hashtag)).toBeTruthy();
    expect(within(closing).getByRole("link", { name: "応募規約・注意事項" }).getAttribute("href")).toBe(
      HALLOWEEN_BEST_SHOT.termsPath,
    );
  });

  test("見出しの並び: 対象作品・企画について・賞品・スケジュールを残し、いちばん下にお礼", () => {
    render(<HalloweenBestShotPage submissionPages={SUBMISSION_PAGES} ended />);
    const names = screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent);
    expect(names).toEqual([
      "WORKSキャンペーン対象作品",
      "ABOUT企画について",
      "PRIZE賞品",
      "SCHEDULEスケジュール",
      "たくさんのご参加、ありがとうございました！",
    ]);
    // お礼はいちばん下の1か所だけ
    expect(document.body.textContent?.split("ありがとうございました").length).toBe(2);
  });

  test("対象作品がまだ無いときも、終わったあとは参加方法と浮いたボタンを出さない", () => {
    render(<HalloweenBestShotPage submissionPages={[]} ended />);
    expect(screen.queryByRole("region", { name: /キャンペーン対象作品/ })).toBeNull();
    expect(screen.queryByRole("region", { name: /参加方法/ })).toBeNull();
    expect(screen.queryByTestId("halloween-floating-cta")).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
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
