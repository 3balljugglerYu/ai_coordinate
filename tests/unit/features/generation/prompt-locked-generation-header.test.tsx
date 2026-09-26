/** @jest-environment jsdom */

/**
 * 生成シートの見出し(`PromptLockedGenerationHeader`)。
 *
 * User ORIGINAL の生成シート(Free Style)と、/styles の生成シート(One-Tap Style)で
 * 共用する。見出し・説明と、ペルコイン購入ページからの戻り先を切り替える。
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { preload } from "react-dom";
import {
  PromptLockedGenerationHeader,
  preloadPercoinIcon,
} from "@/features/generation/components/PromptLockedGenerationHeader";
import { fetchPercoinBalance } from "@/features/credits/lib/api";
import percoinIcon from "@/public/percoin.png";

jest.mock("next-intl", () => ({
  useTranslations:
    (namespace: string) =>
    (key: string) =>
      `${namespace}.${key}`,
}));

type MockImageSrc = string | { src: string };
const srcOf = (src: MockImageSrc) => (typeof src === "string" ? src : src.src);

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({
    alt,
    src,
    loading,
    placeholder,
    unoptimized,
  }: {
    alt: string;
    src: MockImageSrc;
    loading?: string;
    placeholder?: string;
    unoptimized?: boolean;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt}
      src={srcOf(src)}
      data-loading={loading ?? "lazy"}
      data-placeholder={placeholder ?? "empty"}
      data-unoptimized={String(unoptimized ?? false)}
    />
  ),
  // 先読みは next/image が実際に使う URL で行う(最適化しないなら元のファイル)
  getImageProps: ({
    src,
    width,
    unoptimized,
  }: {
    src: MockImageSrc;
    width: number;
    unoptimized?: boolean;
  }) => ({
    props: unoptimized
      ? { src: srcOf(src) }
      : {
          src: `/_next/image?url=${encodeURIComponent(srcOf(src))}&w=${width}`,
          srcSet: `/_next/image?url=${encodeURIComponent(srcOf(src))}&w=48 1x`,
        },
  }),
}));

jest.mock("react-dom", () => ({
  ...jest.requireActual("react-dom"),
  preload: jest.fn(),
}));

jest.mock("@/features/credits/lib/api", () => ({
  fetchPercoinBalance: jest.fn().mockResolvedValue({ balance: 1234 }),
}));

describe("PromptLockedGenerationHeader", () => {
  test("既定は Free Style の見出しで、購入ページからは /free へ戻る", async () => {
    render(<PromptLockedGenerationHeader />);

    expect(screen.getByText("free.pageTitle")).toBeTruthy();
    expect(screen.getByText("free.pageDescription")).toBeTruthy();
    expect((await screen.findByRole("link")).getAttribute("href")).toBe("/credits/purchase?from=free");
  });

  test("mode=style では One-Tap Style の見出しで、購入ページからは /style へ戻る", async () => {
    render(<PromptLockedGenerationHeader mode="style" />);

    expect(screen.getByText("style.pageTitle")).toBeTruthy();
    expect(screen.getByText("style.pageDescription")).toBeTruthy();
    expect((await screen.findByRole("link")).getAttribute("href")).toBe("/credits/purchase?from=style");
  });

  test("showBalancePlaceholder では読み込む前から枠とアイコンを出し、数は「-」にする", async () => {
    let resolveBalance: (value: { balance: number }) => void = () => {};
    (fetchPercoinBalance as jest.Mock).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveBalance = resolve;
      })
    );

    render(<PromptLockedGenerationHeader mode="style" showBalancePlaceholder />);

    // 取れる前から枠(リンク)とアイコンがあり、数は「-」
    const link = screen.getByRole("link");
    expect(link.getAttribute("aria-busy")).toBe("true");
    const icon = screen.getByAltText("credits.percoinUnit");
    // アイコンは import した画像を最適化せずに使う(/_next/static/media から配信され、
    // 本番で長くキャッシュされる)。遅延読み込みせず、届く前はぼかした代わりの画像を出す
    expect(icon.getAttribute("src")).toBe(percoinIcon.src);
    expect(icon.getAttribute("data-unoptimized")).toBe("true");
    expect(icon.getAttribute("data-loading")).toBe("eager");
    expect(icon.getAttribute("data-placeholder")).toBe("blur");
    expect(link.textContent).toContain("- credits.percoinUnit");

    resolveBalance({ balance: 1234 });

    expect(
      (await screen.findByText(/1,234/)).textContent
    ).toContain("1,234 credits.percoinUnit");
    expect(screen.getByRole("link").getAttribute("aria-busy")).toBeNull();
  });

  test("showBalancePlaceholder では取得に失敗しても枠を残して「-」のまま", async () => {
    (fetchPercoinBalance as jest.Mock).mockRejectedValueOnce(new Error("x"));

    render(<PromptLockedGenerationHeader mode="style" showBalancePlaceholder />);

    await Promise.resolve();
    expect(screen.getByRole("link").textContent).toContain("- credits.percoinUnit");
  });

  test("既定(Free Style)では、取れるまで残高の枠を出さない(従来どおり)", async () => {
    (fetchPercoinBalance as jest.Mock).mockReturnValueOnce(new Promise(() => {}));

    render(<PromptLockedGenerationHeader />);

    expect(screen.queryByRole("link")).toBeNull();
  });

  test("既定(Free Style)のアイコンは従来どおり /percoin.png", async () => {
    render(<PromptLockedGenerationHeader />);

    const icon = await screen.findByAltText("credits.percoinUnit");
    expect(icon.getAttribute("src")).toBe("/percoin.png");
    expect(icon.getAttribute("data-placeholder")).toBe("empty");
  });

  test("preloadPercoinIcon は next/image と同じ URL でコインのアイコンを先読みする", () => {
    preloadPercoinIcon();

    // シートの見出しと同じ(import して最適化しない)画像を先読みする
    expect(preload).toHaveBeenCalledWith(
      percoinIcon.src,
      expect.objectContaining({ as: "image" })
    );
  });
});
