/** @jest-environment jsdom */

/**
 * 簡単お着替えの流し始めの待ち(2026-10-17 ユーザー指示)。
 * 「ハロウィン企画がスクロールし始めて約1秒後に、簡単お着替えの方を、スクロールするように」。速さは同じ。
 * 待ちは、上の棚が自動で流れるときだけサーバーから渡る。棚は日本語の画面だけなので、待つのも日本語だけ。
 */

import React from "react";
import { act, render } from "@testing-library/react";
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

const PRESETS = [preset("a"), preset("b"), preset("c")];
let observerCallbacks: IntersectionObserverCallback[] = [];
let requestFrame: jest.Mock;

function setVisible(visible: boolean) {
  act(() => {
    observerCallbacks.forEach((callback) =>
      callback([{ isIntersecting: visible } as IntersectionObserverEntry], {} as IntersectionObserver),
    );
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockLocale.mockReturnValue("ja");
  observerCallbacks = [];
  // 流し始めると requestAnimationFrame を頼む。コマは進めない(頼んだかどうかだけを見る)
  requestFrame = jest.fn(() => 1);
  window.requestAnimationFrame = requestFrame as unknown as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = jest.fn();
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    constructor(callback: IntersectionObserverCallback) {
      observerCallbacks.push(callback);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  jest.useRealTimers();
});

describe("簡単お着替えの流し始め", () => {
  test("⭐上の棚が流れているときは、約1秒待ってから流し始める", () => {
    render(<HomeStylePresetCarousel presets={PRESETS} autoScrollStartDelayMs={1000} />);
    expect(requestFrame).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(999);
    });
    expect(requestFrame).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(requestFrame).toHaveBeenCalledTimes(1);
  });

  test("待ちが無ければ(棚が流れていない・期間外)、今までどおりすぐ流し始める", () => {
    render(<HomeStylePresetCarousel presets={PRESETS} />);

    expect(requestFrame).toHaveBeenCalledTimes(1);
  });

  test("日本語でない画面では待たない(上の棚は日本語の画面だけに出る)", () => {
    mockLocale.mockReturnValue("en");

    render(<HomeStylePresetCarousel presets={PRESETS} autoScrollStartDelayMs={1000} />);

    expect(requestFrame).toHaveBeenCalledTimes(1);
  });

  test("待っているあいだに画面から外れたら、流し始めない。また見えたら、そこから1秒待つ", () => {
    render(<HomeStylePresetCarousel presets={PRESETS} autoScrollStartDelayMs={1000} />);
    act(() => {
      jest.advanceTimersByTime(500);
    });

    setVisible(false);
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(requestFrame).not.toHaveBeenCalled();

    setVisible(true);
    act(() => {
      jest.advanceTimersByTime(999);
    });
    expect(requestFrame).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(requestFrame).toHaveBeenCalledTimes(1);
  });

  test("待っているあいだに見えた知らせが重なっても、流し始めるのは1回", () => {
    render(<HomeStylePresetCarousel presets={PRESETS} autoScrollStartDelayMs={1000} />);

    setVisible(true);
    setVisible(true);
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(requestFrame).toHaveBeenCalledTimes(1);
  });

  test("待っているあいだに外したら(ほかのページへ移ったら)、あとから流し始めない", () => {
    const view = render(<HomeStylePresetCarousel presets={PRESETS} autoScrollStartDelayMs={1000} />);

    view.unmount();
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(requestFrame).not.toHaveBeenCalled();
  });
});
