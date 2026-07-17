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
  styleBrowseConfirmTitle: "こちらを試着しますか？",
  styleBrowseConfirmCancel: "他のスタイルをみる",
  styleBrowseConfirmAction: "試着する",
};

jest.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key === "styleCardAlt") return `スタイル ${values?.name}`;
    if (key === "styleUsageCount") return `これまでに${values?.count}回つくられました`;
    return T[key] ?? key;
  },
}));

function preset(
  id: string,
  overrides: Partial<{
    categoryKey: string;
    createdDaysAgo: number;
    locked: boolean;
    thumbnailWidth: number;
    thumbnailHeight: number;
  }> = {},
): StylePresetPublicSummary {
  const {
    categoryKey = "coordinate",
    createdDaysAgo = 100,
    locked,
    thumbnailWidth = 1,
    thumbnailHeight = 1,
  } = overrides;
  return {
    id,
    title: id,
    thumbnailImageUrl: "https://example.com/x.webp",
    thumbnailWidth,
    thumbnailHeight,
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
    generateTotals: {},
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

  test("カードタップで拡大プレビュー確認が開き、「試着する」で onSelectPreset", () => {
    const { onSelectPreset } = renderSheet();
    fireEvent.click(screen.getByText("p1"));
    // 即選択はされず、確認ダイアログが開く。
    expect(onSelectPreset).not.toHaveBeenCalled();
    expect(screen.getByText("こちらを試着しますか？")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "試着する" }));
    expect(onSelectPreset).toHaveBeenCalledWith("p1");
  });

  test("確認ダイアログの「他のスタイルをみる」で選択せず閉じる", () => {
    const { onSelectPreset } = renderSheet();
    fireEvent.click(screen.getByText("p1"));
    fireEvent.click(screen.getByRole("button", { name: "他のスタイルをみる" }));
    expect(onSelectPreset).not.toHaveBeenCalled();
    expect(screen.queryByText("こちらを試着しますか？")).toBeNull();
  });

  test("確認ダイアログにもお気に入り(しおり)トグルがあり、累計利用回数を表示する", () => {
    const { onToggleFavorite } = renderSheet({
      generateTotals: { p1: 52 },
    });
    fireEvent.click(screen.getByText("p1"));
    // 利用回数
    expect(
      screen.getByText("これまでに52回つくられました"),
    ).toBeInTheDocument();
    // ダイアログ内のしおりトグル(グリッド側と合わせて複数存在するので最後=ダイアログ側)
    const toggles = screen.getAllByRole("button", { name: "お気に入りに追加" });
    fireEvent.click(toggles[toggles.length - 1]);
    expect(onToggleFavorite).toHaveBeenCalledWith("p1", true);
  });

  test("利用回数0のプリセットでは回数を表示しない", () => {
    renderSheet({ generateTotals: {} });
    fireEvent.click(screen.getByText("p1"));
    expect(screen.queryByText(/これまでに.*回/)).toBeNull();
  });

  /** 確認ダイアログ(シート自体も role=dialog のため、最後の dialog を取る)。 */
  function getConfirmDialog(): HTMLElement {
    const dialogs = screen.getAllByRole("dialog");
    return dialogs[dialogs.length - 1];
  }

  /**
   * jsdom は PointerEvent 未実装で fireEvent.pointerDown だと pointerType/clientY が
   * 落ちるため、MouseEvent ベースで pointer イベントを合成して発火する。
   */
  function firePointer(
    el: Element,
    type: "pointerdown" | "pointerup",
    pointerType: string,
    clientY: number,
  ) {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientY,
    });
    Object.defineProperty(event, "pointerType", { value: pointerType });
    fireEvent(el, event);
  }

  test("確認ダイアログの画像はサムネの実アスペクト比で表示(横長は横長・全幅)", () => {
    renderSheet({
      presets: [preset("wide", { thumbnailWidth: 1280, thumbnailHeight: 853 })],
    });
    fireEvent.click(screen.getByText("wide"));
    const dialog = getConfirmDialog();
    const img = dialog.querySelector('img[alt="スタイル wide"]');
    const container = img?.parentElement as HTMLElement;
    expect(container.style.aspectRatio).toBe("1280 / 853");
    // 横長は幅制限(max-w-[280px])を外して全幅を使う。
    expect(container.className).not.toContain("max-w-[280px]");
  });

  test("確認ダイアログの縦長サムネは幅280pxに抑える", () => {
    renderSheet({
      presets: [preset("tall", { thumbnailWidth: 912, thumbnailHeight: 1173 })],
    });
    fireEvent.click(screen.getByText("tall"));
    const dialog = getConfirmDialog();
    const img = dialog.querySelector('img[alt="スタイル tall"]');
    const container = img?.parentElement as HTMLElement;
    expect(container.style.aspectRatio).toBe("912 / 1173");
    expect(container.className).toContain("max-w-[280px]");
  });

  test("確認ダイアログはタッチの下スワイプで閉じる", () => {
    renderSheet();
    fireEvent.click(screen.getByText("p1"));
    const dialog = getConfirmDialog();
    firePointer(dialog, "pointerdown", "touch", 100);
    firePointer(dialog, "pointerup", "touch", 260);
    expect(screen.queryByText("こちらを試着しますか？")).toBeNull();
  });

  test("小さい下スワイプ(閾値未満)やマウスドラッグでは閉じない", () => {
    renderSheet();
    fireEvent.click(screen.getByText("p1"));
    const dialog = getConfirmDialog();
    // 閾値未満のタッチスワイプ
    firePointer(dialog, "pointerdown", "touch", 100);
    firePointer(dialog, "pointerup", "touch", 140);
    expect(screen.getByText("こちらを試着しますか？")).toBeInTheDocument();
    // マウスのドラッグ(テキスト選択等)では閉じない
    firePointer(dialog, "pointerdown", "mouse", 100);
    firePointer(dialog, "pointerup", "mouse", 300);
    expect(screen.getByText("こちらを試着しますか？")).toBeInTheDocument();
  });

  test("確認ダイアログはEscで閉じる(通常Dialog化で外側/Escが効く)", () => {
    renderSheet();
    fireEvent.click(screen.getByText("p1"));
    fireEvent.keyDown(getConfirmDialog(), { key: "Escape" });
    expect(screen.queryByText("こちらを試着しますか？")).toBeNull();
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
