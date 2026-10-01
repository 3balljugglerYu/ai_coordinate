/** @jest-environment jsdom */

/**
 * 投稿詳細の Persta ORIGINAL のカード(2026-10-01 ユーザー決定)。
 *
 * カタログ刷新後(公開前は運営だけ)は、User ORIGINAL と同じく確認を挟まず
 * その場で生成シートを開く。古い /style へは移動させない。
 * 刷新前(一般の利用者)は今のまま、確認してから /style へ移動する。
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { OneTapStyleDetailCard } from "@/features/style/components/OneTapStyleDetailCard";
import type { OneTapStylePresetMetadata } from "@/shared/generation/one-tap-style-metadata";

const pushMock = jest.fn();
jest.mock("next/navigation", () => ({
  usePathname: () => "/posts/post-1",
  useRouter: () => ({ push: pushMock }),
}));

jest.mock("next-intl", () => ({
  useLocale: () => "ja",
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

const mockRevamp = jest.fn(() => true);
jest.mock("@/features/style-presets/hooks/useStylesCatalogRevamp", () => ({
  useStylesCatalogRevamp: () => mockRevamp(),
}));

jest.mock("@/features/style/components/StylePresetPreviewCard", () => ({
  StylePresetPreviewCard: ({ onClick }: { onClick?: () => void }) => (
    <button type="button" data-testid="preset-card" onClick={onClick} />
  ),
}));

jest.mock("@/features/style/components/PresetUnlockNoticeDialog", () => ({
  PresetUnlockNoticeDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="unlock-notice" /> : null,
}));

const openSheetMock = jest.fn(async () => {});
const sheetParams = jest.fn();
jest.mock("@/features/style/hooks/useStylePresetGenerationSheet", () => ({
  useStylePresetGenerationSheet: (params: unknown) => {
    sheetParams(params);
    return { open: openSheetMock, isWorking: false, overlays: null };
  },
}));

const PRESET = {
  id: "preset-1",
  title: "夏のマリンコーデ",
  thumbnailImageUrl: "https://example.test/preset.png",
  thumbnailWidth: 300,
  thumbnailHeight: 400,
  hasBackgroundPrompt: false,
} as unknown as OneTapStylePresetMetadata;

beforeEach(() => {
  jest.clearAllMocks();
  mockRevamp.mockReturnValue(true);
});

describe("OneTapStyleDetailCard(カタログ刷新後)", () => {
  test("カードを押すと、確認を挟まずその場で生成シートを開く", () => {
    render(<OneTapStyleDetailCard preset={PRESET} currentUserId="viewer-1" />);

    fireEvent.click(screen.getByTestId("preset-card"));

    expect(openSheetMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("style.detailReuseConfirmTitle")).toBeNull();
    expect(pushMock).not.toHaveBeenCalled();
    expect(sheetParams).toHaveBeenCalledWith(
      expect.objectContaining({
        presetId: "preset-1",
        currentUserId: "viewer-1",
        isViewerResolved: true,
      })
    );
  });

  test("カードの下に「このカタログで生成する」を置き、押すと同じシートを開く", () => {
    render(<OneTapStyleDetailCard preset={PRESET} currentUserId={null} />);

    const button = screen.getByTestId("feed-use-style-button");
    expect(button.textContent).toContain("posts.feedUseCatalog");

    fireEvent.click(button);
    expect(openSheetMock).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["未開放", { status: "locked", reason: "sequential" } as const],
    ["要ログイン", { status: "login_required" } as const],
    ["会期終了", { status: "ended" } as const],
  ])("%sのスタイルはシートを開かず、理由の案内を出す", (_label, unlockState) => {
    render(
      <OneTapStyleDetailCard
        preset={PRESET}
        unlockState={unlockState}
        currentUserId="viewer-1"
      />
    );

    expect(screen.queryByTestId("feed-use-style-button")).toBeNull();
    fireEvent.click(screen.getByTestId("preset-card"));

    expect(openSheetMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("unlock-notice")).toBeTruthy();
  });
});

describe("OneTapStyleDetailCard(一般の利用者)", () => {
  beforeEach(() => mockRevamp.mockReturnValue(false));

  test("今のまま、確認してから /style へ移動する。ボタンは置かない", () => {
    render(<OneTapStyleDetailCard preset={PRESET} currentUserId="viewer-1" />);

    expect(screen.queryByTestId("feed-use-style-button")).toBeNull();
    fireEvent.click(screen.getByTestId("preset-card"));

    expect(openSheetMock).not.toHaveBeenCalled();
    expect(screen.getByText("style.detailReuseConfirmTitle")).toBeTruthy();

    fireEvent.click(screen.getByText("style.detailReuseConfirmAction"));
    expect(pushMock).toHaveBeenCalledWith("/style?style=preset-1");
  });
});
