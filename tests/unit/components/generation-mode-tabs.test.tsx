/** @jest-environment jsdom */

/**
 * 生成画面の上のモード切替タブ。
 *
 * 生成モード Coordinate は廃止した（docs/planning/coordinate-mode-deprecation-plan.md）。
 * タブは One-Tap Style と Free Style の2つだけにし、/coordinate を指すものを残さない。
 * タブは滞在中のモードを「前回のモード」として保存し、ナビの生成入口がそれを読む
 * （features/generation/lib/generation-mode-preference.ts）。
 */

const mockPrefetch = jest.fn();
const mockPathname = jest.fn(() => "/ja/free");
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ push: jest.fn(), prefetch: mockPrefetch }),
}));

// 名前空間ごとに区別できるラベルを返す（どのキーを出しているかを見るため）。
// 翻訳関数は名前空間ごとに同じものを返す。タブは翻訳関数を useLayoutEffect の
// 依存に入れている（GenerationModeTabs.tsx）ので、毎回作り直すと測り直しが止まらない
const mockTranslators = new Map<string, (key: string) => string>();
jest.mock("next-intl", () => ({
  useTranslations: (namespace: string) => {
    let translate = mockTranslators.get(namespace);
    if (!translate) {
      translate = (key: string) => `${namespace}.${key}`;
      mockTranslators.set(namespace, translate);
    }
    return translate;
  },
}));

import { act, render, screen } from "@testing-library/react";
import { GenerationModeTabs } from "@/components/GenerationModeTabs";
import { LAST_GENERATION_MODE_STORAGE_KEY as STORAGE_KEY } from "@/features/generation/lib/generation-mode-preference";

async function renderTabs() {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(<GenerationModeTabs />);
  });
  return result!;
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  mockPathname.mockReturnValue("/ja/free");
});

describe("GenerationModeTabs", () => {
  test("タブは One-Tap Style と Free Style の2つで、/coordinate へのリンクは無い", async () => {
    const { container } = await renderTabs();

    // 読み上げでまとめて伝える名前も2つだけ（ラベルの一覧はタブの定義とは別に組み立てている）
    expect(
      screen.queryByRole("tablist", { name: "style.pageTitle / free.tabLabel" })
    ).not.toBeNull();

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.getAttribute("href"))).toEqual([
      "/ja/style",
      "/ja/free",
    ]);
    expect(tabs.map((tab) => tab.getAttribute("aria-label"))).toEqual([
      "style.pageTitle",
      "free.tabLabel",
    ]);
    expect(container.querySelector('a[href*="coordinate"]')).toBeNull();

    const prefetched = mockPrefetch.mock.calls.map(([href]) => String(href));
    // 先読みの効果が動いたことを確かめてから、含まれないことを見る
    expect(prefetched).toContain("/ja/style");
    expect(prefetched.filter((href) => href.includes("coordinate"))).toEqual([]);
  });

  test.each([
    ["/ja/style", "/style"],
    ["/ja/free", "/free"],
  ])("%s に滞在すると前回のモードとして %s を保存する", async (pathname, stored) => {
    mockPathname.mockReturnValue(pathname);
    await renderTabs();

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(stored);
  });

  test("/coordinate ではタブを出さず、前回のモードも書き換えない", async () => {
    // 転送が効く前に開かれていた画面など、万一 /coordinate で描画されても
    // 前回のモードを書き換えない（Coordinate も、その読み替え先の Free Style も書かない）
    window.localStorage.setItem(STORAGE_KEY, "/style");
    mockPathname.mockReturnValue("/ja/coordinate");

    const { container } = await renderTabs();

    expect(screen.queryByRole("tablist")).toBeNull();
    expect(container.innerHTML).toBe("");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("/style");
  });
});
