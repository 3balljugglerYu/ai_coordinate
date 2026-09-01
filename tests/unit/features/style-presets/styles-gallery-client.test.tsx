/** @jest-environment jsdom */

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
  styleFavoriteAdd: "お気に入りに追加",
  styleFavoriteRemove: "お気に入りを解除",
  stylePopularSortNote: "直近30日の生成数順",
  styleBrowseConfirmTitle: "こちらを試着しますか？",
  styleBrowseConfirmAction: "試着する",
  styleBrowseConfirmCancel: "他のスタイルをみる",
};

const HOME_T: Record<string, string> = {
  stylePresetConfirmTitle: "こちらを試着しますか？",
  stylePresetConfirmCancel: "キャンセル",
  stylePresetConfirmAction: "試着する",
};

jest.mock("next-intl", () => ({
  useTranslations:
    (namespace?: string) =>
    (key: string, values?: Record<string, unknown>) => {
      if (namespace === "home") return HOME_T[key] ?? key;
      if (key === "styleNewSortNote") return `直近${values?.days}日の新着`;
      if (key === "styleCardAlt") return `スタイル ${values?.name}`;
      if (key === "styleUsageCount")
        return `このスタイルが${values?.count}回以上利用されました`;
      return T[key] ?? key;
    },
}));

const routerPushMock = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock }),
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
    thumbnailWidth: number;
    thumbnailHeight: number;
    providerNickname: string;
  }> = {},
): StylePresetPublicSummary {
  const {
    categoryKey = "coordinate",
    categoryLabelJa = "コーディネート",
    publishedDaysAgo = 100,
    thumbnailWidth = 912,
    thumbnailHeight = 1173,
    providerNickname,
  } = overrides;
  const publishedAt = new Date(
    Date.parse(NOW_ISO) - publishedDaysAgo * 86400000,
  ).toISOString();
  return {
    id,
    slug: id,
    title: id,
    thumbnailImageUrl: "https://example.com/x.webp",
    thumbnailWidth,
    thumbnailHeight,
    hasBackgroundPrompt: false,
    createdAt: publishedAt,
    publishedAt,
    imageInputMode: "single",
    dualReferenceSource: "admin",
    providerUserId: providerNickname ? "provider-1" : null,
    providerNickname: providerNickname ?? null,
    providerAvatarUrl: null,
    category: {
      id: `cat-${categoryKey}`,
      key: categoryKey,
      displayNameJa: categoryLabelJa,
      displayNameEn: categoryLabelJa,
      badgeColor: "rgb(255, 87, 34)",
      badgeTextColor: "rgb(255, 255, 255)",
      isCollectionSeries: false,
      collectionDisplayStartsAt: null,
      collectionDisplayEndsAt: null,
      providerUserId: null,
    },
  } as unknown as StylePresetPublicSummary;
}

describe("StylesGalleryClient", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: null } });
    favoritesSelectMock.mockResolvedValue({ data: [] });
    fetchMock.mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;
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
        generateTotals={{}}
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

  test("カード_admin設定色のカテゴリバッジを表示しcoordinateには出さない", () => {
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
        generateTotals={{}}
        nowIso={NOW_ISO}
        locale="ja"
      />,
    );

    // 「アレンジ」はチップ + カード上のバッジの2箇所(バッジは aria-label 付き span)
    const badge = screen
      .getAllByText("アレンジ")
      .find((el) => el.tagName === "SPAN" && el.getAttribute("aria-label"));
    expect(badge).toBeTruthy();
    expect((badge as HTMLElement).style.backgroundColor).toBe(
      "rgb(255, 87, 34)",
    );
    expect((badge as HTMLElement).style.color).toBe("rgb(255, 255, 255)");

    // default カテゴリの coordinate はバッジ非表示(チップの1箇所のみ)
    expect(screen.getAllByText("コーディネート")).toHaveLength(1);
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
        generateTotals={{}}
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
        generateTotals={{}}
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
        generateTotals={{}}
        nowIso={NOW_ISO}
        locale="ja"
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: /新着/ }));

    expect(screen.queryByText("style-old")).toBeNull();
    expect(screen.getByText("style-new")).toBeTruthy();
  });

  test("カード選択_試着確認モーダルを開き「試着する」で/styleへ遷移する", () => {
    render(
      <StylesGalleryClient
        presets={[preset("style-a")]}
        generateCounts={{}}
        generateTotals={{}}
        nowIso={NOW_ISO}
        locale="ja"
      />,
    );

    fireEvent.click(screen.getByText("style-a"));

    // 紹介ページへ即遷移せず、ホームと同じ試着確認モーダルを出す
    expect(screen.getByText("こちらを試着しますか？")).toBeTruthy();
    fireEvent.click(screen.getByText("試着する"));

    expect(routerPushMock).toHaveBeenCalledWith("/ja/style?style=style-a");
  });

  // jsdom は aspect-ratio プロパティを解釈せず style 属性から落とすため、
  // 実比率表示の分岐は「横長=全幅 / 縦長=幅280px制限」の class 切替で検証する
  // (探索シートと同じ表示ロジック)。
  function getConfirmImageFrame(presetId: string): HTMLElement {
    // 1枚目はグリッドのカード画像、2枚目がモーダル内の拡大画像
    const images = screen.getAllByAltText(`スタイル ${presetId}`);
    const frame = images[images.length - 1]?.parentElement;
    expect(frame).toBeTruthy();
    return frame as HTMLElement;
  }

  test("カード選択_横長サムネイルはクロップせず全幅で表示する", () => {
    render(
      <StylesGalleryClient
        presets={[
          preset("style-wide", { thumbnailWidth: 1200, thumbnailHeight: 800 }),
        ]}
        generateCounts={{}}
        generateTotals={{}}
        nowIso={NOW_ISO}
        locale="ja"
      />,
    );

    fireEvent.click(screen.getByText("style-wide"));

    const frame = getConfirmImageFrame("style-wide");
    expect(frame.className).not.toContain("max-w-[280px]");
    // 3:4 固定クロップ(旧実装)に戻っていないこと
    expect(frame.className).not.toContain("aspect-[3/4]");
  });

  test("カード選択_縦長サムネイルは幅280pxに制限する", () => {
    render(
      <StylesGalleryClient
        presets={[preset("style-tall")]}
        generateCounts={{}}
        generateTotals={{}}
        nowIso={NOW_ISO}
        locale="ja"
      />,
    );

    fireEvent.click(screen.getByText("style-tall"));

    const frame = getConfirmImageFrame("style-tall");
    expect(frame.className).toContain("max-w-[280px]");
    expect(frame.className).not.toContain("aspect-[3/4]");
  });

  test("モーダル_提供者クレジットと累計生成数を表示する", () => {
    render(
      <StylesGalleryClient
        presets={[preset("style-a", { providerNickname: "氷洞つらら" })]}
        generateCounts={{}}
        generateTotals={{ "style-a": 12 }}
        nowIso={NOW_ISO}
        locale="ja"
      />,
    );

    fireEvent.click(screen.getByText("style-a"));

    // モーダル内に提供者クレジットと累計生成数が表示される
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText(/氷洞つらら/)).toBeTruthy();
    // 表示は「◯回以上」なので丸めた値になる(12 → 10)
    expect(
      dialog.getByText("このスタイルが10回以上利用されました"),
    ).toBeTruthy();
    // 探索シートと同じボタン構成(「他のスタイルをみる」で閉じる)
    expect(dialog.getByText("他のスタイルをみる")).toBeTruthy();
  });

  test("モーダル_累計0回のプリセットでは回数を表示しない", () => {
    render(
      <StylesGalleryClient
        presets={[preset("style-a")]}
        generateCounts={{}}
        generateTotals={{}}
        nowIso={NOW_ISO}
        locale="ja"
      />,
    );

    fireEvent.click(screen.getByText("style-a"));

    expect(screen.getByText("こちらを試着しますか？")).toBeTruthy();
    expect(screen.queryByText(/これまでに/)).toBeNull();
  });

  test("モーダル_Escで閉じられる(AlertDialogではなく通常のDialog)", async () => {
    render(
      <StylesGalleryClient
        presets={[preset("style-a")]}
        generateCounts={{}}
        generateTotals={{}}
        nowIso={NOW_ISO}
        locale="ja"
      />,
    );

    fireEvent.click(screen.getByText("style-a"));
    expect(screen.getByText("こちらを試着しますか？")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() =>
      expect(screen.queryByText("こちらを試着しますか？")).toBeNull(),
    );
  });

  test("カードタイトル_16文字を超える場合は1行に切り詰める", () => {
    render(
      <StylesGalleryClient
        presets={[preset("あいうえおかきくけこさしすせそたちつてと")]}
        generateCounts={{}}
        generateTotals={{}}
        nowIso={NOW_ISO}
        locale="ja"
      />,
    );

    expect(
      screen.getByText("あいうえおかきくけこさしすせそた..."),
    ).toBeTruthy();
  });

  test("カード選択_修飾キー付きクリックはモーダルを開かない(リンク既定動作)", () => {
    render(
      <StylesGalleryClient
        presets={[preset("style-a")]}
        generateCounts={{}}
        generateTotals={{}}
        nowIso={NOW_ISO}
        locale="ja"
      />,
    );

    fireEvent.click(screen.getByText("style-a"), { metaKey: true });

    expect(screen.queryByText("こちらを試着しますか？")).toBeNull();
  });

  test("しおり_ログイン済みはトグルでAPIを呼び楽観更新する", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });

    render(
      <StylesGalleryClient
        presets={[preset("style-a")]}
        generateCounts={{}}
        generateTotals={{}}
        nowIso={NOW_ISO}
        locale="ja"
      />,
    );

    // 認証状態がクライアントで解決されるのを待つ(お気に入りチップの出現で判定)
    await screen.findByRole("tab", { name: /お気に入り/ });

    fireEvent.click(screen.getByRole("button", { name: "お気に入りに追加" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/style-presets/favorites",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ presetId: "style-a" }),
      }),
    );
    // 楽観更新でしおりが「解除」表示に切り替わる
    expect(
      screen.getByRole("button", { name: "お気に入りを解除" }),
    ).toBeTruthy();
  });

  test("しおり_未ログインはAPIを呼ばない(ログイン誘導のみ)", async () => {
    render(
      <StylesGalleryClient
        presets={[preset("style-a")]}
        generateCounts={{}}
        generateTotals={{}}
        nowIso={NOW_ISO}
        locale="ja"
      />,
    );
    await waitFor(() => expect(getUserMock).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "お気に入りに追加" }));

    expect(fetchMock).not.toHaveBeenCalled();
    // 集合は変更されない(「追加」表示のまま)
    expect(
      screen.getByRole("button", { name: "お気に入りに追加" }),
    ).toBeTruthy();
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
        generateTotals={{}}
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
