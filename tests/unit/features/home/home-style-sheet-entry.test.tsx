/** @jest-environment jsdom */

/**
 * ホームのスタイルカルーセル・開催中の企画の棚を押したとき(2026-10-01 ユーザー決定)。
 *
 * カタログ刷新後(公開前は運営だけ)は古い /style を使わない。確認を挟まず、
 * 押したスタイルでその場で生成シートを開く。
 * 刷新前(一般の利用者)は今のまま、試着確認から /style へ。
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { HomeStylePresetCarousel } from "@/features/home/components/HomeStylePresetCarousel";
import { HomeEventShelfSection } from "@/features/home/components/HomeEventShelfSection";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";
import type { EventShelf } from "@/features/home/lib/derive-event-shelves";

const pushMock = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));
jest.mock("next-intl", () => ({
  useLocale: () => "ja",
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
jest.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/features/collections/components/CollectionProgressModal", () => ({
  CollectionProgressModal: () => null,
}));
jest.mock("@/features/collections/components/CollectionMountComposer", () => ({
  CollectionMountComposer: () => null,
}));
jest.mock("@/features/home/components/EventShelfCountdown", () => ({
  EventShelfCountdown: () => null,
}));
jest.mock("@/features/style/components/StylePresetPreviewCard", () => ({
  StylePresetPreviewCard: ({
    preset,
    onClick,
  }: {
    preset: { id: string };
    onClick?: () => void;
  }) => (
    <button type="button" data-testid={`card-${preset.id}`} onClick={onClick} />
  ),
}));
jest.mock("@/features/style-presets/components/StyleTryOnConfirmDialog", () => ({
  StyleTryOnConfirmDialog: ({
    preset,
    onConfirm,
  }: {
    preset: { id: string } | null;
    onConfirm: () => void;
  }) =>
    preset ? (
      <button type="button" data-testid="try-on-confirm" onClick={onConfirm} />
    ) : null,
}));

const mockRevamp = jest.fn(() => true);
jest.mock("@/features/style-presets/hooks/useStylesCatalogRevamp", () => ({
  useStylesCatalogRevamp: () => mockRevamp(),
}));
const mockViewer = jest.fn(() => ({ id: "viewer-1" }) as { id: string | null } | null);
jest.mock("@/features/style/hooks/useResolvedViewer", () => ({
  useResolvedViewer: () => mockViewer(),
}));
const openSheetMock = jest.fn(async () => {});
const sheetParams = jest.fn();
jest.mock("@/features/style/hooks/useStylePresetGenerationSheet", () => ({
  useStylePresetGenerationSheet: (params: unknown) => {
    sheetParams(params);
    return { open: openSheetMock, isOpen: false, isWorking: false, overlays: null };
  },
}));

function preset(id: string): StylePresetPublicSummary {
  return { id, slug: `slug-${id}`, title: id } as unknown as StylePresetPublicSummary;
}

const SHELF: EventShelf = {
  categoryId: "cat-1",
  categoryKey: "event",
  displayNameJa: "企画",
  displayNameEn: "Event",
  cards: [
    { kind: "new", preset: preset("new-1") },
    { kind: "done", preset: preset("done-1") },
  ],
  collectedCount: 1,
  totalCount: 3,
  endsAt: null,
  isCompleted: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRevamp.mockReturnValue(true);
  mockViewer.mockReturnValue({ id: "viewer-1" });
  // jsdom に無いので、自動スクロールの描画ループは止めておく
  window.requestAnimationFrame = jest.fn(() => 0);
  window.cancelAnimationFrame = jest.fn();
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

describe.each([
  [
    "スタイルカルーセル",
    () => render(<HomeStylePresetCarousel presets={[preset("style-1")]} />),
    "style-1",
  ],
  [
    "開催中の企画の棚(NEW)",
    () => render(<HomeEventShelfSection shelf={SHELF} nowIso="2026-10-01T00:00:00Z" />),
    "new-1",
  ],
  [
    "開催中の企画の棚(生成済み)",
    () => render(<HomeEventShelfSection shelf={SHELF} nowIso="2026-10-01T00:00:00Z" />),
    "done-1",
  ],
])("%s", (_label, renderTarget, presetId) => {
  test("刷新後: 確認を挟まず、押したスタイルでその場で生成シートを開く", () => {
    renderTarget();

    fireEvent.click(screen.getAllByTestId(`card-${presetId}`)[0]);

    expect(openSheetMock).toHaveBeenCalledWith({
      presetId,
      slug: `slug-${presetId}`,
    });
    expect(screen.queryByTestId("try-on-confirm")).toBeNull();
    expect(pushMock).not.toHaveBeenCalled();
    expect(sheetParams).toHaveBeenLastCalledWith({
      currentUserId: "viewer-1",
      isViewerResolved: true,
    });
  });

  test("刷新後: 閲覧者を確かめ終える前は、未確定のままシートに渡す(押しても開かない)", () => {
    mockViewer.mockReturnValue(null);
    renderTarget();

    expect(sheetParams).toHaveBeenLastCalledWith({
      currentUserId: null,
      isViewerResolved: false,
    });
  });

  test("刷新前: 今のまま、試着確認から /style へ", () => {
    mockRevamp.mockReturnValue(false);
    renderTarget();

    fireEvent.click(screen.getAllByTestId(`card-${presetId}`)[0]);
    expect(openSheetMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("try-on-confirm"));
    expect(pushMock).toHaveBeenCalledWith(`/ja/style?style=${presetId}`);
  });
});
