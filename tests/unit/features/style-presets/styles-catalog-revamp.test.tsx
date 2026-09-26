/** @jest-environment jsdom */

import { act, render, screen } from "@testing-library/react";
import { StylesCatalogHeading } from "@/features/style-presets/components/StylesCatalogHeading";
import { StylesCatalogChipBar } from "@/features/style-presets/components/StylesCatalogChipBar";
import { StylesCatalogMain } from "@/features/style-presets/components/StylesCatalogMain";
import {
  UserStylesAvailabilityProvider,
  UserStylesAvailabilityUpgrade,
} from "@/features/user-styles/components/UserStylesAvailabilityProvider";

/**
 * カタログ刷新は User ORIGINAL と同じ段階公開に乗る(useStylesCatalogRevamp)。
 * ここではモックせず実物の Provider を通し、「公開前は刷新前の表示、
 * 運営と判定されたら刷新後」を確かめる。
 */

const HEADING_PROPS = {
  heading: "スタイル一覧",
  intro: "キャラクターのイラストをワンタップで着せ替えできるAIスタイルのカタログです。",
  originalIntro: "安定して生成できるプロンプトを選んで掲載しています。",
};

describe("カタログ刷新の段階公開", () => {
  const originalFlag = process.env.NEXT_PUBLIC_USER_STYLES_ENABLED;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_USER_STYLES_ENABLED;
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_USER_STYLES_ENABLED = originalFlag;
  });

  test("公開前・一般の閲覧者: 見出しは刷新前、チップ列は固定しない", () => {
    render(
      <UserStylesAvailabilityProvider>
        <StylesCatalogHeading {...HEADING_PROPS} />
        <StylesCatalogChipBar>
          <span>chips</span>
        </StylesCatalogChipBar>
      </UserStylesAvailabilityProvider>,
    );

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "スタイル一覧",
    );
    expect(screen.getByText(HEADING_PROPS.intro)).toBeTruthy();
    expect(screen.queryByTestId("styles-catalog-chip-bar")).toBeNull();
    expect(screen.getByText("chips")).toBeTruthy();
  });

  test("公開前・運営: 見出しを出さず説明を差し替え、チップ列を上端に固定する", async () => {
    await act(async () => {
      render(
        <UserStylesAvailabilityProvider>
          <StylesCatalogHeading {...HEADING_PROPS} />
          <StylesCatalogChipBar>
            <span>chips</span>
          </StylesCatalogChipBar>
          <UserStylesAvailabilityUpgrade />
        </UserStylesAvailabilityProvider>,
      );
    });

    // 見出しは出さず(ページの h1 は上の「Catalog」)、説明だけを新しい文言にする
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText(HEADING_PROPS.originalIntro)).toBeTruthy();
    const bar = screen.getByTestId("styles-catalog-chip-bar");
    expect(bar.className).toContain("sticky");
    // スマホでは画面の上端、PC(lg 以上)では固定ヘッダーの直下にぴったり固定する
    expect(bar.className).toContain("top-0");
    expect(bar.className).toContain("lg:top-[var(--app-header-height,64px)]");
    // 下の一覧が透けないよう不透明な帯にする
    expect(bar.className).toContain("bg-white");
  });

  test("ページ背景と上余白: 刷新前は gray-50・上余白あり、運営には白・上余白なし", async () => {
    const { unmount } = render(
      <UserStylesAvailabilityProvider>
        <StylesCatalogMain>
          <span>body</span>
        </StylesCatalogMain>
      </UserStylesAvailabilityProvider>,
    );
    expect(screen.getByRole("main").className).toContain("bg-gray-50");
    expect(screen.getByText("body").parentElement?.className).toContain("pt-6");
    unmount();

    await act(async () => {
      render(
        <UserStylesAvailabilityProvider>
          <StylesCatalogMain>
            <span>body</span>
          </StylesCatalogMain>
          <UserStylesAvailabilityUpgrade />
        </UserStylesAvailabilityProvider>,
      );
    });
    expect(screen.getByRole("main").className).toContain("bg-white");
    // タブの区切り線を消したので、見出しの上余白は付けない
    expect(screen.getByText("body").parentElement?.className).toContain("pt-0");
  });

  test("一般公開後: 運営判定を待たずに刷新後になる", () => {
    process.env.NEXT_PUBLIC_USER_STYLES_ENABLED = "true";
    render(
      <UserStylesAvailabilityProvider>
        <StylesCatalogHeading {...HEADING_PROPS} />
      </UserStylesAvailabilityProvider>,
    );

    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText(HEADING_PROPS.originalIntro)).toBeTruthy();
  });
});
