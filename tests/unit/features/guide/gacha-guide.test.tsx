/** @jest-environment jsdom */

/**
 * ガチャ機能の紹介ページ(/guide/gacha)。計画書: docs/planning/gacha-guide-page-plan.md
 *
 * - 運営だけの間は、ほかの人には 404(ガチャ機能と同じ判定)
 * - 画面の名前は、生成画面・ナビ・タブと同じ文言を差し込む(ページに書き写さない)
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
  isGachaPromptAvailable: jest.fn(),
  isGachaPromptPubliclyEnabled: jest.fn(),
}));
// 翻訳は「名前空間.キー(差し込んだ値)」の文字列にする。差し込んだ画面の名前をそのまま確かめられる
jest.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => (key: string, values?: Record<string, unknown>) =>
    values ? `${namespace}.${key}(${JSON.stringify(values)})` : `${namespace}.${key}`,
}));

import GachaGuidePage from "@/app/guide/gacha/page";
import { GachaGuide } from "@/features/guide/components/GachaGuide";
import { getUser } from "@/lib/auth";
import { isGachaPromptAvailable, isGachaPromptPubliclyEnabled } from "@/lib/env";
import { isSitemapPathEnabled } from "@/lib/sitemap-paths";
import { GACHA_MAX_CANDIDATES, GACHA_MIN_CANDIDATES } from "@/shared/generation/gacha-prompt";
import { GACHA_SPLIT_PERCOIN_COST } from "@/shared/generation/gacha-split";

const mockGetUser = getUser as jest.MockedFunction<typeof getUser>;
const mockAvailable = isGachaPromptAvailable as jest.MockedFunction<typeof isGachaPromptAvailable>;
const mockPublic = isGachaPromptPubliclyEnabled as jest.MockedFunction<
  typeof isGachaPromptPubliclyEnabled
>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("見せる相手", () => {
  test("ガチャ機能を使えない人(運営でない・未公開)には 404", async () => {
    mockGetUser.mockResolvedValue({ id: "user-1" } as Awaited<ReturnType<typeof getUser>>);
    mockAvailable.mockReturnValue(false);
    await expect(GachaGuidePage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockAvailable).toHaveBeenCalledWith("user-1");
  });

  test("ログインしていない人は、未公開なら 404", async () => {
    mockGetUser.mockResolvedValue(null);
    mockAvailable.mockReturnValue(false);
    await expect(GachaGuidePage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mockAvailable).toHaveBeenCalledWith(undefined);
  });

  test("ガチャ機能を使える人には、ページを出す", async () => {
    mockGetUser.mockResolvedValue({ id: "admin-1" } as Awaited<ReturnType<typeof getUser>>);
    mockAvailable.mockReturnValue(true);
    const element = await GachaGuidePage();
    render(await (element.type as () => Promise<React.ReactElement>)());
    expect(screen.getByTestId("gacha-guide")).toBeTruthy();
  });
});

describe("ページの中身", () => {
  async function renderGuide() {
    render(await GachaGuide());
  }

  test("見出しは1つ(h1)で、ページの見出しの文言を使う", async () => {
    await renderGuide();
    const h1 = screen.getAllByRole("heading", { level: 1 });
    expect(h1).toHaveLength(1);
    expect(h1[0].textContent).toBe("gachaGuide.heroTitle");
  });

  test("画面の名前は、ナビ・タブ・生成画面と同じ文言を差し込む", async () => {
    await renderGuide();
    const text = document.body.textContent ?? "";
    expect(text).toContain('gachaGuide.whereStep1({"catalog":"nav.catalog"})');
    expect(text).toContain('gachaGuide.whereStep2({"create":"userStyles.tabCreate"})');
    expect(text).toContain('gachaGuide.step3Title({"toggle":"free.gachaToggleLabel"})');
    expect(text).toContain('gachaGuide.step3Text({"promptLabel":"free.promptLabel"})');
    expect(text).toContain('gachaGuide.step5AcceptText({"accept":"free.gachaSplitAccept"})');
    // ボタンの名前は、実際の画面と同じく額を入れた形で差し込む
    expect(text).toContain(
      `gachaGuide.step5WriteText({"splitButton":"free.gachaSplitButton({\\"cost\\":${GACHA_SPLIT_PERCOIN_COST}})"})`,
    );
    expect(text).toContain(`gachaGuide.step5Cost({"cost":${GACHA_SPLIT_PERCOIN_COST}})`);
  });

  test("候補の数の案内は、生成画面と同じ上限・下限を差し込む", async () => {
    await renderGuide();
    const text = document.body.textContent ?? "";
    const range = JSON.stringify({ min: GACHA_MIN_CANDIDATES, max: GACHA_MAX_CANDIDATES });
    expect(text).toContain(`gachaGuide.step4Text(${range})`);
    expect(text).toContain(`gachaGuide.ctaNote(${range})`);
  });

  test("「この画面で使えます」は三角の無いラベルにする", async () => {
    await renderGuide();
    const label = screen.getByText("gachaGuide.whereStep3Call");
    expect(label.className).toContain("after:hidden");
  });

  test("「ガチャをやってみる」は、カタログをつくる(/free)へのリンク", async () => {
    await renderGuide();
    const link = screen.getByRole("link", { name: "gachaGuide.ctaButton" });
    expect(link.getAttribute("href")).toBe("/free");
  });

  test("使い方は6つの手順を、決めた順番で出す", async () => {
    await renderGuide();
    const titles = screen
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent ?? "")
      .filter((title) => /gachaGuide\.step\d/.test(title));
    expect(titles.map((title) => title.match(/step(\d)/)?.[1])).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  test("画像の説明(alt)も翻訳した文言を使う", async () => {
    await renderGuide();
    const alts = screen.getAllByRole("img").map((image) => image.getAttribute("alt") ?? "");
    expect(alts).toContain('gachaGuide.whereStep1Alt({"catalog":"nav.catalog"})');
    expect(alts).toContain("gachaGuide.step4Alt");
    // 日本語を直書きした alt が無い(全言語で同じ画像を使うので、説明は文言から出す)
    expect(alts.filter((alt) => /[ぁ-んァ-ヶ一-龠]/.test(alt))).toEqual([]);
  });
});

describe("sitemap", () => {
  test("一般公開まで /guide/gacha を載せない", () => {
    mockPublic.mockReturnValue(false);
    expect(isSitemapPathEnabled("/guide/gacha")).toBe(false);
  });

  test("一般公開したら載せる(検索に出す。2026-10-05 決定)", () => {
    mockPublic.mockReturnValue(true);
    expect(isSitemapPathEnabled("/guide/gacha")).toBe(true);
  });
});
