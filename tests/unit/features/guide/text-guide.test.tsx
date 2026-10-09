/** @jest-environment jsdom */

/**
 * 文字入力の紹介ページ(/guide/text)。計画書: docs/planning/name-input-slot-plan.md Phase 6
 *
 * - 運営だけの間は、ほかの人には 404(文字入力と同じ判定)
 * - 画面の名前は、生成画面・ナビ・タブと同じ文言を差し込む(ページに書き写さない)
 * - 文字数の上限・ペルコインは、生成画面と同じ値を差し込む
 * - 一般公開まで sitemap に載せない
 */

import React from "react";
import { render, screen } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
jest.mock("next/server", () => ({ connection: jest.fn(async () => undefined) }));
jest.mock("@/lib/auth", () => ({ getUser: jest.fn() }));
jest.mock("@/lib/env", () => ({
  ...jest.requireActual("@/lib/env"),
  getSiteUrl: jest.fn(() => "https://persta.ai"),
  isNameInputAvailable: jest.fn(),
  isNameInputPubliclyEnabled: jest.fn(),
}));
// 翻訳は「名前空間.キー(差し込んだ値)」の文字列にする。差し込んだ画面の名前をそのまま確かめられる
jest.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => (key: string, values?: Record<string, unknown>) =>
    values ? `${namespace}.${key}(${JSON.stringify(values)})` : `${namespace}.${key}`,
}));

import TextGuidePage, { generateMetadata } from "@/app/guide/text/page";
import { TextGuide } from "@/features/guide/components/TextGuide";
import { getUser } from "@/lib/auth";
import { isNameInputPubliclyEnabled } from "@/lib/env";
import { isSitemapPathEnabled } from "@/lib/sitemap-paths";
import {
  NAME_INPUT_HINT_MAX_LENGTH,
  NAME_INPUT_LABEL_MAX_LENGTH,
  NAME_INPUT_MAX_LENGTH,
} from "@/shared/generation/name-input";
import { NAME_INPUT_CREATE_PERCOIN_COST } from "@/shared/generation/name-input-create";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockPublic = isNameInputPubliclyEnabled as jest.MockedFunction<typeof isNameInputPubliclyEnabled>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("見せる相手(URL を知っていれば誰でも。2026-10-08 ユーザー決定)", () => {
  test("ログインしていなくても、運営でなくても、ページを出す", async () => {
    const element = await TextGuidePage();
    render(await (element.type as () => Promise<React.ReactElement>)());
    expect(screen.getByTestId("text-guide")).toBeTruthy();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  test("文字入力を一般公開するまでは、検索に出さない(noindex)", async () => {
    mockPublic.mockReturnValue(false);
    expect((await generateMetadata()).robots).toEqual({ index: false, follow: false });
  });

  test("一般公開したら、検索に出す", async () => {
    mockPublic.mockReturnValue(true);
    expect((await generateMetadata()).robots).toBeUndefined();
  });
});

describe("ページの中身", () => {
  async function renderGuide() {
    render(await TextGuide());
  }

  test("見出しは1つ(h1)で、ページの見出しの文言を使う", async () => {
    await renderGuide();
    const h1 = screen.getAllByRole("heading", { level: 1 });
    expect(h1).toHaveLength(1);
    expect(h1[0].textContent).toBe("textGuide.heroTitle");
  });

  test("画面の名前は、ナビ・タブ・生成画面と同じ文言を差し込む", async () => {
    await renderGuide();
    const text = document.body.textContent ?? "";
    expect(text).toContain('gachaGuide.whereStep1({"catalog":"nav.catalog"})');
    expect(text).toContain('textGuide.step3Title({"toggle":"free.nameInputToggleLabel"})');
    expect(text).toContain(
      'textGuide.step3Text({"promptLabel":"free.promptLabel","optionsTitle":"free.promptGimmicksTitle","gachaToggle":"free.gachaToggleLabel"})',
    );
    expect(text).toContain(
      'textGuide.step4Title({"label":"free.nameInputLabelSetting","hint":"free.nameInputPlaceholderSetting"})',
    );
    expect(text).toContain('textGuide.userPoint1({"userTitle":"userStyles.tabUserTitle","useCatalog":"posts.feedUseCatalog"})');
  });

  test("文字数の上限とペルコインは、生成画面と同じ値を差し込む", async () => {
    await renderGuide();
    const text = document.body.textContent ?? "";
    const limits = JSON.stringify({
      label: "free.nameInputLabelSetting",
      hint: "free.nameInputPlaceholderSetting",
      max: NAME_INPUT_MAX_LENGTH,
      labelMax: NAME_INPUT_LABEL_MAX_LENGTH,
      hintMax: NAME_INPUT_HINT_MAX_LENGTH,
      cost: NAME_INPUT_CREATE_PERCOIN_COST,
    });
    expect(text).toContain(`textGuide.step4Text(${limits})`);
    expect(text).toContain(`"cost":${NAME_INPUT_CREATE_PERCOIN_COST}`);
    expect(text).toContain(`textGuide.ctaNote({"max":${NAME_INPUT_MAX_LENGTH}`);
  });

  test("使い方は6つの手順を、決めた順番で出す", async () => {
    await renderGuide();
    const titles = screen
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent ?? "")
      .filter((title) => /textGuide\.step\d/.test(title));
    expect(titles.map((title) => title.match(/step(\d)/)?.[1])).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  test("「文字入力をつかってみる」は、浮かぶボタンと締めの章のボタンで、どちらも /free へ", async () => {
    await renderGuide();
    const links = screen.getAllByRole("link", { name: "textGuide.ctaButton" });
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/free", "/free"]);
  });

  test("生成例が届くまでは、点線の枠に翻訳した説明を付けて出す", async () => {
    await renderGuide();
    const placeholders = screen.getAllByTestId("text-guide-example-placeholder");
    expect(placeholders.length).toBeGreaterThan(0);
    expect(placeholders[0].getAttribute("aria-label")).toMatch(/^textGuide\.exampleAlt\(/);
  });

  test("「好きな言葉・四字熟語」は届いた書道の2枚", async () => {
    await renderGuide();
    const alts = screen.getAllByRole("img").map((image) => image.getAttribute("alt"));
    expect(alts).toContain('textGuide.exampleAlt({"text":"平々凡々"})');
    expect(alts).toContain('textGuide.exampleAlt({"text":"楽"})');
  });

  test("生成例はどの章も2枚ずつ。最初の章は届いた画像(2026-10-08)", async () => {
    await renderGuide();
    const hero = document.querySelector("#text-guide-hero")!.closest("section")!;
    const heroImages = [...hero.querySelectorAll("img")];
    expect(heroImages.map((image) => image.getAttribute("alt"))).toEqual([
      'textGuide.exampleAlt({"text":"ちゃんりお"})',
      'textGuide.exampleAlt({"text":"レナ"})',
    ]);
    document.querySelectorAll(".grid-cols-2").forEach((pair) => {
      if (pair.querySelector('[data-testid="text-guide-example-placeholder"], img[alt^="textGuide.exampleAlt"]')) {
        expect(pair.children).toHaveLength(2);
      }
    });
  });

  test("画像の説明(alt)も翻訳した文言を使う(日本語を直書きしない)", async () => {
    await renderGuide();
    const alts = screen.getAllByRole("img").map((image) => image.getAttribute("alt") ?? image.getAttribute("aria-label") ?? "");
    expect(alts).toContain("textGuide.step1Alt");
    expect(alts.filter((alt) => /[ぁ-んァ-ヶ一-龠]/.test(alt.replace(/\{[^}]*\}|\([^)]*\)/g, "")))).toEqual([]);
  });
});

describe("sitemap", () => {
  test("一般公開まで /guide/text を載せない", () => {
    mockPublic.mockReturnValue(false);
    expect(isSitemapPathEnabled("/guide/text")).toBe(false);
  });

  test("一般公開したら載せる", () => {
    mockPublic.mockReturnValue(true);
    expect(isSitemapPathEnabled("/guide/text")).toBe(true);
  });
});
