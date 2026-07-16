/** @jest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { StyleBrowseSheet } from "@/features/style/components/StyleBrowseSheet";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt }: { alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src="" />
  ),
}));

const T: Record<string, string> = {
  styleBrowseSheetTitle: "スタイルをさがす",
  styleBrowseEmpty: "該当するスタイルがありません",
  styleChipAll: "すべて",
  styleChipFavorites: "お気に入り",
  styleChipNew: "新着",
  styleChipPopular: "人気",
  styleChipCreator: "クリエイター",
  styleFavoriteAdd: "お気に入りに追加",
  styleFavoriteRemove: "お気に入りを解除",
  styleFavoritesEmpty: "お気に入りはまだありません",
  styleDripLockedLabel: "あとで とうじょう",
  styleGeneratedBadge: "生成済み",
};

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    key === "styleCardAlt" ? `スタイル ${values?.name}` : (T[key] ?? key),
}));

function preset(
  id: string,
  overrides: Partial<{
    categoryKey: string;
    createdDaysAgo: number;
    locked: boolean;
  }> = {},
): StylePresetPublicSummary {
  const { categoryKey = "coordinate", createdDaysAgo = 100, locked } = overrides;
  return {
    id,
    title: id,
    thumbnailImageUrl: "https://example.com/x.webp",
    thumbnailWidth: 1,
    thumbnailHeight: 1,
    hasBackgroundPrompt: false,
    createdAt: new Date(Date.now() - createdDaysAgo * 86400000).toISOString(),
    category: {
      key: categoryKey,
      displayNameJa: categoryKey,
      displayNameEn: categoryKey,
      badgeColor: "#000",
      badgeTextColor: "#fff",
    } as StylePresetPublicSummary["category"],
    imageInputMode: "single",
    dualReferenceSource: "admin",
    locked,
  } as StylePresetPublicSummary;
}

function renderSheet(
  overrides: Partial<Parameters<typeof StyleBrowseSheet>[0]> = {},
) {
  const onSelectPreset = jest.fn();
  const onToggleFavorite = jest.fn();
  const props: Parameters<typeof StyleBrowseSheet>[0] = {
    open: true,
    onOpenChange: jest.fn(),
    presets: [preset("p1"), preset("p2", { createdDaysAgo: 2 })],
    generateCounts: {},
    favoriteIds: new Set<string>(),
    onToggleFavorite,
    onSelectPreset,
    isAuthenticated: true,
    generatedPresetIds: new Set<string>(),
    locale: "ja",
    selectedPresetId: null,
    ...overrides,
  };
  render(<StyleBrowseSheet {...props} />);
  return { onSelectPreset, onToggleFavorite };
}

describe("StyleBrowseSheet", () => {
  test("チップ(すべて/お気に入り/新着)とグリッドのカードを描画する", () => {
    renderSheet();
    expect(screen.getByRole("tab", { name: "すべて" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /お気に入り/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /新着/ })).toBeInTheDocument();
    expect(screen.getByText("p1")).toBeInTheDocument();
    expect(screen.getByText("p2")).toBeInTheDocument();
  });

  test("チップで絞り込める(新着→p2のみ)", () => {
    renderSheet();
    fireEvent.click(screen.getByRole("tab", { name: /新着/ }));
    expect(screen.queryByText("p1")).toBeNull();
    expect(screen.getByText("p2")).toBeInTheDocument();
  });

  test("カードタップで onSelectPreset が呼ばれる", () => {
    const { onSelectPreset } = renderSheet();
    fireEvent.click(screen.getByText("p1"));
    expect(onSelectPreset).toHaveBeenCalledWith("p1");
  });

  test("♡タップで onToggleFavorite(id, true) が呼ばれ、選択は発火しない", () => {
    const { onToggleFavorite, onSelectPreset } = renderSheet();
    fireEvent.click(
      screen.getAllByRole("button", { name: "お気に入りに追加" })[0],
    );
    expect(onToggleFavorite).toHaveBeenCalledWith("p1", true);
    expect(onSelectPreset).not.toHaveBeenCalled();
  });

  test("お気に入り済みの♡は解除ラベルになり、(id, false) で呼ばれる", () => {
    const { onToggleFavorite } = renderSheet({
      favoriteIds: new Set(["p1"]),
    });
    fireEvent.click(screen.getByRole("button", { name: "お気に入りを解除" }));
    expect(onToggleFavorite).toHaveBeenCalledWith("p1", false);
  });

  test("未ログインではお気に入りチップを出さない", () => {
    renderSheet({ isAuthenticated: false });
    expect(screen.queryByRole("tab", { name: /お気に入り/ })).toBeNull();
  });

  test("お気に入りチップで0件なら空メッセージ", () => {
    renderSheet({ favoriteIds: new Set<string>() });
    fireEvent.click(screen.getByRole("tab", { name: /お気に入り/ }));
    expect(
      screen.getByText("お気に入りはまだありません"),
    ).toBeInTheDocument();
  });

  test("locked カードはシルエット表示・♡なし・選択不可", () => {
    const { onSelectPreset } = renderSheet({
      presets: [preset("p1"), preset("sec", { locked: true })],
    });
    expect(screen.getByText("あとで とうじょう")).toBeInTheDocument();
    // locked カードに♡は無い(追加ボタンは p1 の1つだけ)。
    expect(
      screen.getAllByRole("button", { name: "お気に入りに追加" }),
    ).toHaveLength(1);
    fireEvent.click(screen.getByText("sec"));
    expect(onSelectPreset).not.toHaveBeenCalled();
  });
});
