/**
 * ツールの流入元タグ。
 *
 * 書式を外すと `parseSignupSource` に落とされ、DB の CHECK にも弾かれる。
 * その場合**何も記録されず、しかも画面上は何も起きない**ので気づけない。
 */

import { render } from "@testing-library/react";
import ImageSplitPage, { metadata } from "@/app/tools/image-split/page";
import { parseSignupSource } from "@/features/auth/lib/signup-source";

jest.mock("@/features/style-presets/lib/style-preset-repository", () => ({
  getPublishedStylePresetById: jest.fn().mockResolvedValue({
    id: "8d6d595a-2b1b-4181-af82-cbec04e56fe3",
    title: "横長16:9 へ拡張",
    thumbnailImageUrl: "https://example.test/preset.png",
  }),
}));

/** async な Server Component を解決してから描画する。 */
async function renderPage() {
  const ui = await ImageSplitPage();
  return render(ui);
}
import { IMAGE_SPLIT_SIGNUP_SOURCE } from "@/features/tools/lib/tool-signup-sources";

describe("IMAGE_SPLIT_SIGNUP_SOURCE", () => {
  test("⭐parseSignupSource を通る(通らないと黙って記録されない)", () => {
    expect(parseSignupSource(IMAGE_SPLIT_SIGNUP_SOURCE)).toBe(
      IMAGE_SPLIT_SIGNUP_SOURCE,
    );
  });

  test("DB の CHECK と同じ書式を満たす(小文字英数 + _ -、1..40文字)", () => {
    expect(IMAGE_SPLIT_SIGNUP_SOURCE).toMatch(/^[a-z0-9_-]{1,40}$/);
  });

  test("既存タグ(style / wardrobe)と衝突しない", () => {
    expect(["style", "wardrobe"]).not.toContain(IMAGE_SPLIT_SIGNUP_SOURCE);
  });
});

/**
 * ページ本体(SEO 用の本文・構造化データ・生成導線)。
 *
 * 構造化データは**本文と同じ内容**であることが前提(本文に無いことを
 * 構造化データにだけ書くとガイドライン違反になる)。ここでズレを検出する。
 */
describe("画像4分割ツールのページ", () => {
  test("⭐構造化データの FAQ が本文の FAQ と一致する", async () => {
    const { container } = await renderPage();
    const script = container.querySelector(
      'script[type="application/ld+json"]',
    );
    const jsonLd = JSON.parse(script?.textContent ?? "[]") as Array<{
      "@type": string;
      mainEntity?: Array<{ name: string; acceptedAnswer: { text: string } }>;
      step?: Array<{ name: string; text: string }>;
    }>;

    const faq = jsonLd.find((node) => node["@type"] === "FAQPage");
    expect(faq?.mainEntity?.length).toBeGreaterThanOrEqual(5);
    for (const item of faq?.mainEntity ?? []) {
      // 質問も回答も本文に出ている
      expect(container.textContent).toContain(item.name);
      expect(container.textContent).toContain(item.acceptedAnswer.text);
    }
  });

  test("⭐構造化データの HowTo が本文の手順と一致する", async () => {
    const { container } = await renderPage();
    const jsonLd = JSON.parse(
      container.querySelector('script[type="application/ld+json"]')
        ?.textContent ?? "[]",
    ) as Array<{ "@type": string; step?: Array<{ name: string; text: string }> }>;

    const howTo = jsonLd.find((node) => node["@type"] === "HowTo");
    expect(howTo?.step).toHaveLength(3);
    for (const step of howTo?.step ?? []) {
      expect(container.textContent).toContain(step.name);
      expect(container.textContent).toContain(step.text);
    }
  });

  test("無料ツールであることを SoftwareApplication で示す", async () => {
    const { container } = await renderPage();
    const jsonLd = JSON.parse(
      container.querySelector('script[type="application/ld+json"]')
        ?.textContent ?? "[]",
    ) as Array<{ "@type": string; offers?: { price: string } }>;

    const app = jsonLd.find((node) => node["@type"] === "SoftwareApplication");
    expect(app?.offers?.price).toBe("0");
  });

  test("⭐生成導線に signup_source と 16:9 プリセットが入っている", async () => {
    const { container } = await renderPage();
    const link = container.querySelector(
      'a[href*="signup_source"]',
    ) as HTMLAnchorElement | null;

    expect(link?.getAttribute("href")).toBe(
      "/ja/style?style=8d6d595a-2b1b-4181-af82-cbec04e56fe3&signup_source=tool_image_split",
    );
  });

  test("h1 は枚数を限定しない(2〜4分割に対応したため)", async () => {
    const { container } = await renderPage();
    const h1 = container.querySelector("h1")?.textContent ?? "";

    expect(h1).toContain("画像分割");
    // 4分割しかできないと読める見出しには戻さない
    expect(h1).not.toContain("画像4分割");
  });

  /**
   * ⭐ X の複数画像の並び方を断定しない。
   *
   * X は 2026-07 から表示形式をカルーセル(横一列)へ順次変更しており、
   * iOS アプリでは既にカルーセル、Android・ブラウザでは従来の並びが残る。
   * 「2×2に並ぶ」と書くと **iOS で見ている人には事実と違う**
   * (実機のスクリーンショットで判明。それまで誤った案内を公開していた)。
   */
  test("⭐並び方を断定せず、環境で異なることを添える", async () => {
    const { container } = await renderPage();
    const text = container.textContent ?? "";

    expect(text).not.toContain("2×2に並び");
    // 環境差に触れていること
    expect(text).toContain("環境によって見え方が異なります");
    // どの環境でも言えることは残す
    expect(text).toContain("続きがつながって見えます");
  });

  test("⭐タイトルタグは具体的な枚数を残す(いちばん検索される語を捨てない)", () => {
    const title = String(metadata.title ?? "");

    expect(title).toContain("画像分割ツール");
    for (const keyword of ["2分割", "3分割", "4分割"]) {
      expect(title).toContain(keyword);
    }
  });
});

/**
 * 分割の材料をつくる導線(サムネイル付きカード)。
 *
 * 文字リンクだと読み飛ばされるため、サムネイルを主役にしてカードごと押せる形にした。
 * 遷移することは矢印だけに頼らず文言でも伝える。
 */
describe("分割する画像をつくる のカード", () => {
  test("⭐サムネイルとタイトルが出て、カード全体がリンクになっている", async () => {
    const { container } = await renderPage();

    const card = container.querySelector(
      'a[href*="signup_source"]',
    ) as HTMLAnchorElement;
    expect(card).toBeTruthy();
    // カードの中にサムネイルがある(文字だけのリンクではない)
    expect(card.querySelector("img")).toBeTruthy();
    expect(card.textContent).toContain("横長16:9 へ拡張");
  });

  test("⭐タップで遷移することを文言で伝える(矢印だけに頼らない)", async () => {
    const { container } = await renderPage();

    expect(container.textContent).toContain(
      "タップすると生成ページへ移動します",
    );
  });

  test("「どんなときに使えるか」より前に置く(視覚から入れるように)", async () => {
    const { container } = await renderPage();

    const headings = [...container.querySelectorAll("h2")].map(
      (h) => h.textContent ?? "",
    );
    expect(headings.indexOf("分割する画像をつくる")).toBeLessThan(
      headings.indexOf("どんなときに使えるか"),
    );
  });
});

describe("プリセットが取得できないとき", () => {
  test("⭐カードごと出さない(壊れた画像枠を見せない)", async () => {
    const { getPublishedStylePresetById } = jest.requireMock(
      "@/features/style-presets/lib/style-preset-repository",
    ) as { getPublishedStylePresetById: jest.Mock };
    getPublishedStylePresetById.mockResolvedValueOnce(null);

    const { container } = await renderPage();

    expect(container.querySelector('a[href*="signup_source"]')).toBeNull();
    // 見出しと説明文は残る(SEO の本文としても意味がある)
    expect(container.textContent).toContain("分割する画像をつくる");
  });

  test("サムネイルURLが無いプリセットでもカードを出さない", async () => {
    const { getPublishedStylePresetById } = jest.requireMock(
      "@/features/style-presets/lib/style-preset-repository",
    ) as { getPublishedStylePresetById: jest.Mock };
    getPublishedStylePresetById.mockResolvedValueOnce({
      id: "8d6d595a-2b1b-4181-af82-cbec04e56fe3",
      title: "横長16:9 へ拡張",
      thumbnailImageUrl: null,
    });

    const { container } = await renderPage();

    expect(container.querySelector('a[href*="signup_source"]')).toBeNull();
  });
});

describe("サムネイルの比率", () => {
  /*
    正方形にすると縦構図が上下で切れ、One-Tap Style のカードで見たときと
    印象が変わる。PublicStyleCard と同じ 3/4 に揃える。
  */
  test("⭐One-Tap Style のカードと同じ 3/4(正方形にしない)", async () => {
    const { container } = await renderPage();

    const frame = container
      .querySelector('a[href*="signup_source"] img')
      ?.closest("div");

    expect(frame?.className).toContain("aspect-[3/4]");
    expect(frame?.className).not.toContain("aspect-square");
  });
});
