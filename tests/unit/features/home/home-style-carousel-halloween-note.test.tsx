/**
 * ホームの「簡単お着替え！」の横の注記(2026-10-16 ユーザー指示)。
 *
 * ハロウィン企画の作品と思って、簡単お着替えから生成してしまう人がいる。
 * 簡単お着替え(Persta ORIGINAL)で作って投稿しても、どちらの部門にも数えないので、
 * 期間中だけ見出しの横に「※ハロウィン企画には関係ありません」を小さく添える。
 * 企画は日本国内向けなので、日本語の画面だけ。期間はサーバーが決めて渡す。
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { HomeStylePresetCarousel } from "@/features/home/components/HomeStylePresetCarousel";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";

const mockLocale = jest.fn(() => "ja");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("next-intl", () => ({
  useLocale: () => mockLocale(),
  useTranslations: () => (key: string) => key,
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
jest.mock("next/image", () => ({ __esModule: true, default: () => null }));
jest.mock("swiper/react", () => ({
  Swiper: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SwiperSlide: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock("swiper/modules", () => ({ FreeMode: {} }));
jest.mock("swiper/css", () => ({}));
jest.mock("swiper/css/free-mode", () => ({}));
jest.mock("@/features/style/components/StylePresetPreviewCard", () => ({
  StylePresetPreviewCard: ({ preset }: { preset: { id: string } }) => (
    <div data-testid={`card-${preset.id}`} />
  ),
}));
jest.mock("@/features/style-presets/components/StyleTryOnConfirmDialog", () => ({
  StyleTryOnConfirmDialog: () => null,
}));
jest.mock("@/features/style-presets/hooks/useStylesCatalogRevamp", () => ({
  useStylesCatalogRevamp: () => true,
}));
jest.mock("@/features/style/hooks/useResolvedViewer", () => ({
  useResolvedViewer: () => ({ id: "viewer-1" }),
}));
jest.mock("@/features/style/hooks/useStylePresetGenerationSheet", () => ({
  useStylePresetGenerationSheet: () => ({
    open: jest.fn(),
    isOpen: false,
    isWorking: false,
    workingPresetId: null,
    overlays: null,
  }),
}));

function preset(id: string): StylePresetPublicSummary {
  return { id, slug: `slug-${id}`, title: id } as unknown as StylePresetPublicSummary;
}

const NOTE = "※ハロウィン企画には関係ありません";

beforeEach(() => {
  mockLocale.mockReturnValue("ja");
  // jsdom に無いので、自動スクロールの描画ループは止めておく
  window.requestAnimationFrame = jest.fn(() => 0);
  window.cancelAnimationFrame = jest.fn();
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe("ホームの「簡単お着替え！」の注記", () => {
  test("期間中は見出しの横に、小さく「※ハロウィン企画には関係ありません」", () => {
    render(<HomeStylePresetCarousel presets={[preset("style-1")]} isHalloweenCampaignOpen />);
    const note = screen.getByTestId("home-style-carousel-halloween-note");
    expect(note.textContent).toBe(NOTE);
    expect(note.className).toContain("text-[11px]");
    // 見出しと同じ行の器の中(入りきらなければ見出しの下へ折り返す)
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).toBe("stylePresetCarouselTitle");
    expect(note.parentElement).toBe(heading.parentElement);
    expect(note.parentElement?.className).toContain("flex-wrap");
    // 見出しの文字そのものは変えない(読み上げの名前も今のまま)
    expect(heading.textContent).not.toContain(NOTE);
  });

  test("期間外(既定)は出さない", () => {
    render(<HomeStylePresetCarousel presets={[preset("style-1")]} />);
    expect(screen.queryByText(NOTE)).toBeNull();
  });

  test("日本語以外の画面では、期間中でも出さない(企画は日本国内向け)", () => {
    mockLocale.mockReturnValue("en");
    render(<HomeStylePresetCarousel presets={[preset("style-1")]} isHalloweenCampaignOpen />);
    expect(screen.queryByText(NOTE)).toBeNull();
  });
});
