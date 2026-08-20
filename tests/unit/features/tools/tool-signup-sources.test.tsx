/**
 * ツールの流入元タグ。
 *
 * 書式を外すと `parseSignupSource` に落とされ、DB の CHECK にも弾かれる。
 * その場合**何も記録されず、しかも画面上は何も起きない**ので気づけない。
 */

import { render } from "@testing-library/react";
import ImageSplitPage from "@/app/tools/image-split/page";
import { parseSignupSource } from "@/features/auth/lib/signup-source";
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
  test("⭐構造化データの FAQ が本文の FAQ と一致する", () => {
    const { container } = render(<ImageSplitPage />);
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

  test("⭐構造化データの HowTo が本文の手順と一致する", () => {
    const { container } = render(<ImageSplitPage />);
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

  test("無料ツールであることを SoftwareApplication で示す", () => {
    const { container } = render(<ImageSplitPage />);
    const jsonLd = JSON.parse(
      container.querySelector('script[type="application/ld+json"]')
        ?.textContent ?? "[]",
    ) as Array<{ "@type": string; offers?: { price: string } }>;

    const app = jsonLd.find((node) => node["@type"] === "SoftwareApplication");
    expect(app?.offers?.price).toBe("0");
  });

  test("⭐生成導線に signup_source と 16:9 プリセットが入っている", () => {
    const { container } = render(<ImageSplitPage />);
    const link = container.querySelector(
      'a[href*="signup_source"]',
    ) as HTMLAnchorElement | null;

    expect(link?.getAttribute("href")).toBe(
      "/ja/style?style=8d6d595a-2b1b-4181-af82-cbec04e56fe3&signup_source=tool_image_split",
    );
  });

  test("h1 が検索語(画像4分割)を含む", () => {
    const { container } = render(<ImageSplitPage />);
    expect(container.querySelector("h1")?.textContent).toContain("画像4分割");
  });
});
