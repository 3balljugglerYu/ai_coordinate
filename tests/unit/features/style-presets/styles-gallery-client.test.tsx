/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StylesGalleryClient } from "@/features/style-presets/components/StylesGalleryClient";
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
  styleChipEvent: "イベント",
  styleChipFavorites: "お気に入り",
  styleChipNew: "新着",
  styleChipPopular: "人気",
  styleChipCreator: "クリエイター",
  styleFavoritesEmpty: "お気に入りはまだありません",
  stylePopularSortNote: "直近30日の生成数順",
};

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key === "styleNewSortNote") return `直近${values?.days}日の新着`;
    return T[key] ?? key;
  },
}));

// /styles は静的ページのため、認証状態とお気に入りはブラウザ側で取得する。
const getUserMock = jest.fn();
const favoritesSelectMock = jest.fn();
jest.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => getUserMock(...args) },
    from: () => ({
      select: (...args: unknown[]) => favoritesSelectMock(...args),
    }),
  }),
}));

const NOW_ISO = "2026-07-25T00:00:00.000Z";

function preset(
  id: string,
  overrides: Partial<{
    categoryKey: string;
    categoryLabelJa: string;
    publishedDaysAgo: number;
  }> = {},
): StylePresetPublicSummary {
  const {
    categoryKey = "coordinate",
    categoryLabelJa = "コーディネート",
    publishedDaysAgo = 100,
  } = overrides;
  const publishedAt = new Date(
    Date.parse(NOW_ISO) - publishedDaysAgo * 86400000,
  ).toISOString();
  return {
    id,
    slug: id,
    title: id,
    thumbnailImageUrl: "https://example.com/x.webp",
    thumbnailWidth: 912,
    thumbnailHeight: 1173,
    hasBackgroundPrompt: false,
    createdAt: publishedAt,
    publishedAt,
    imageInputMode: "single",
    dualReferenceSource: "admin",
    category: {
      id: `cat-${categoryKey}`,
      key: categoryKey,
      displayNameJa: categoryLabelJa,
      displayNameEn: categoryLabelJa,
      isCollectionSeries: false,
      collectionDisplayStartsAt: null,
      collectionDisplayEndsAt: null,
      providerUserId: null,
    },
  } as unknown as StylePresetPublicSummary;
}

describe("StylesGalleryClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: null } });
    favoritesSelectMock.mockResolvedValue({ data: [] });
  });

  test("初期表示_全プリセットとカテゴリチップを表示する", async () => {
    render(
      <StylesGalleryClient
        presets={[
          preset("style-a"),
          preset("style-b", {
            categoryKey: "character_remix",
            categoryLabelJa: "アレンジ",
          }),
        ]}
        generateCounts={{}}
        nowIso={NOW_ISO}
        locale="ja"
      />,
    );

    expect(screen.getByText("style-a")).toBeTruthy();
    expect(screen.getByText("style-b")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "すべて" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "コーディネート" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "アレンジ" })).toBeTruthy();
    // 未ログインではお気に入りチップは出さない
    await waitFor(() => expect(getUserMock).toHaveBeenCalled());
    expect(screen.queryByRole("tab", { name: /お気に入り/ })).toBeNull();
  });

  test("カテゴリチップ_選択でグリッドを絞り込む", () => {
    render(
      <StylesGalleryClient
        presets={[
          preset("style-a"),
          preset("style-b", {
            categoryKey: "character_remix",
            categoryLabelJa: "アレンジ",
          }),
        ]}
        generateCounts={{}}
        nowIso={NOW_ISO}
        locale="ja"
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "アレンジ" }));

    expect(screen.queryByText("style-a")).toBeNull();
    expect(screen.getByText("style-b")).toBeTruthy();
  });

  test("人気チップ_生成数の降順で並び替え注記も表示する", () => {
    render(
      <StylesGalleryClient
        presets={[
          preset("style-a"),
          preset("style-b", {
            categoryKey: "character_remix",
            categoryLabelJa: "アレンジ",
          }),
          preset("style-c"),
        ]}
        generateCounts={{ "style-a": 2, "style-b": 10 }}
        nowIso={NOW_ISO}
        locale="ja"
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /人気/ }));

    // 生成数 0 の style-c は人気に出ない
    expect(screen.queryByText("style-c")).toBeNull();
    expect(screen.getByText("直近30日の生成数順")).toBeTruthy();
    const titles = screen
      .getAllByText(/^style-/)
      .map((el) => el.textContent);
    expect(titles).toEqual(["style-b", "style-a"]);
  });

  test("新着チップ_公開14日以内のみ表示する", () => {
    render(
      <StylesGalleryClient
        presets={[
          preset("style-old", { publishedDaysAgo: 100 }),
          preset("style-new", { publishedDaysAgo: 3 }),
        ]}
        generateCounts={{}}
        nowIso={NOW_ISO}
        locale="ja"
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /新着/ }));

    expect(screen.queryByText("style-old")).toBeNull();
    expect(screen.getByText("style-new")).toBeTruthy();
  });

  test("ログイン済み_お気に入りチップが現れ絞り込める", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    favoritesSelectMock.mockResolvedValue({
      data: [{ preset_id: "style-b" }],
    });

    render(
      <StylesGalleryClient
        presets={[
          preset("style-a"),
          preset("style-b", {
            categoryKey: "character_remix",
            categoryLabelJa: "アレンジ",
          }),
        ]}
        generateCounts={{}}
        nowIso={NOW_ISO}
        locale="ja"
      />,
    );

    const favoritesChip = await screen.findByRole("tab", {
      name: /お気に入り/,
    });
    fireEvent.click(favoritesChip);

    expect(screen.queryByText("style-a")).toBeNull();
    expect(screen.getByText("style-b")).toBeTruthy();
  });
});
