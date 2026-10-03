/** @jest-environment jsdom */

/**
 * CREATE(/free)の生成結果一覧に、ほかの人のプロンプトで作ったもの(派生生成)を混ぜない。
 *
 * ⭐ カタログ刷新(公開前は運営だけ)の人だけに適用する。一般の利用者の /free の一覧は
 * 一般公開の日まで今のまま(派生生成も含む)。刷新の判定は isUserStylesAvailable
 * (公開フラグ または 運営)で、画面のタブの出し分け(useStylesCatalogRevamp)と同じ。
 */

import React from "react";
import { render } from "@testing-library/react";

jest.mock("next/server", () => ({ connection: async () => {} }));
// ログインの案内などブラウザ側の部品が next-intl を読むので、翻訳は名前をそのまま返す
jest.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
  useLocale: () => "ja",
}));
jest.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => (key: string) => `${namespace}.${key}`,
  getLocale: async () => "ja",
}));
jest.mock("@/lib/auth", () => ({ getUser: async () => ({ id: "user-1" }) }));
jest.mock("@/features/my-page/lib/server-api", () => ({
  getUserProfileServer: async () => ({ subscription_plan: "free" }),
}));
const mockAvailable = jest.fn<boolean, [string | null | undefined]>();
const mockGachaAvailable = jest.fn<boolean, [string | null | undefined]>();
jest.mock("@/lib/env", () => ({
  isUserStylesAvailable: (userId: string | null | undefined) => mockAvailable(userId),
  isGachaPromptAvailable: (userId: string | null | undefined) =>
    mockGachaAvailable(userId),
}));
jest.mock("@/components/RefreshOnMount", () => ({ RefreshOnMount: () => null }));
jest.mock("@/features/credits/components/CachedGenerationPercoinBalance", () => ({
  CachedGenerationPercoinBalance: () => null,
}));
const mockFormContainer = jest.fn<null, [Record<string, unknown>]>(() => null);
jest.mock("@/features/generation/components/GenerationFormContainer", () => ({
  GenerationFormContainer: (props: Record<string, unknown>) =>
    mockFormContainer(props),
}));
jest.mock("@/features/generation/context/GenerationStateContext", () => ({
  GenerationStateProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
const mockGallery = jest.fn<null, [Record<string, unknown>]>(() => null);
jest.mock("@/features/generation/components/CachedGeneratedImageGallery", () => ({
  CachedGeneratedImageGallery: (props: Record<string, unknown>) => mockGallery(props),
}));

import { FreePageBody } from "@/features/generation/components/FreePageBody";

beforeEach(() => {
  mockGallery.mockClear();
  mockAvailable.mockReset();
  mockGachaAvailable.mockReset();
  mockFormContainer.mockClear();
});

describe("FreePageBody の生成結果一覧", () => {
  test("刷新後(運営・公開後)は、自分のプロンプトで作ったものだけにする", async () => {
    mockAvailable.mockReturnValue(true);
    render(await FreePageBody());

    expect(mockAvailable).toHaveBeenCalledWith("user-1");
    expect(mockGallery).toHaveBeenCalledTimes(1);
    expect(mockGallery.mock.calls[0][0]).toMatchObject({
      userId: "user-1",
      generationType: "free",
      ownPromptsOnly: true,
    });
  });

  test("一般の利用者は今までどおり(派生生成も含める)", async () => {
    mockAvailable.mockReturnValue(false);
    render(await FreePageBody());

    expect(mockGallery.mock.calls[0][0]).toMatchObject({
      generationType: "free",
      ownPromptsOnly: false,
    });
  });
});

describe("FreePageBody のガチャプロンプト", () => {
  // カタログ刷新とは別のフラグで出し分ける(刷新の判定と独立していること)
  test.each([
    { catalog: true, gacha: false },
    { catalog: false, gacha: true },
  ])(
    "刷新=$catalog でも、ガチャの判定($gacha)をそのままフォームへ渡す",
    async ({ catalog, gacha }) => {
      mockAvailable.mockReturnValue(catalog);
      mockGachaAvailable.mockReturnValue(gacha);
      render(await FreePageBody());

      expect(mockGachaAvailable).toHaveBeenCalledWith("user-1");
      expect(mockFormContainer.mock.calls[0][0]).toMatchObject({
        mode: "free",
        gachaPromptAvailable: gacha,
      });
    },
  );
});
