/** @jest-environment jsdom */

/**
 * 生成結果一覧（リスト表示）の「このイラストで生成」。
 *
 * One-Tap Style と Inspire の一覧は、確認ダイアログを出してから別画面のフォームへ
 * 画像を持ち越す。持ち越し先は、廃止した Coordinate から Free Style に変えた
 * （docs/planning/coordinate-mode-deprecation-plan.md ADR-004）。
 * 受け取る側は GenerationForm（tests/unit/features/generation/generation-form.test.tsx）。
 *
 * Free Style の一覧は同じ画面にフォームがあるので、遷移せずにイベントで渡す。
 */

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, prefetch: jest.fn() }),
}));

const stableTranslate = (key: string) => key;
// 既定(ja)でないロケールにする。既定ロケールの固定値でも通ってしまわないように
jest.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => stableTranslate,
}));

jest.mock("@/features/posts/hooks/usePostPageNavigation", () => ({
  usePostPageNavigation: () => ({ isNavigating: false, openPostPage: jest.fn() }),
}));

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

jest.mock("@/features/generation/lib/download-image", () => ({
  shareOrDownloadGeneratedImage: jest.fn(),
}));

jest.mock("@/features/generation/components/ImageModal", () => ({
  ImageModal: () => null,
}));

import { fireEvent, render, screen } from "@testing-library/react";
import { GeneratedImageList } from "@/features/generation/components/GeneratedImageList";
import {
  COORDINATE_APPLY_FROM_HISTORY_EVENT,
  COORDINATE_PENDING_SOURCE_IMAGE_KEY,
  type CoordinateApplyFromHistoryDetail,
} from "@/features/generation/lib/apply-from-history-event";
import type { GeneratedImageData } from "@/features/generation/types";
import { locales } from "@/i18n/config";
import { getAllMessages } from "@/i18n/messages";

// 原本(url)と表示用(displayUrl)を別の値にする。持ち越すのは原本で、
// 表示用の縮小 WebP に差し替えてはいけない（types.ts の GeneratedImageData.url）
const IMAGE: GeneratedImageData = {
  id: "image-1",
  url: "https://example.supabase.co/storage/v1/object/public/generated-images/u/image-1.png",
  displayUrl:
    "https://example.supabase.co/storage/v1/object/public/generated-images/u/image-1_display.webp",
  is_posted: false,
  createdAt: "2026-09-27T00:00:00.000Z",
};

type ApplyActionMode = Parameters<
  typeof GeneratedImageList
>[0]["applyActionMode"];

function renderList(applyActionMode: ApplyActionMode) {
  return render(
    <GeneratedImageList
      images={[IMAGE]}
      detailFromParam="style"
      returnToImageIdKey="persta-ai:style-return-to-image-id"
      applyActionMode={applyActionMode}
      generationType="one_tap_style"
    />
  );
}

/**
 * 同じボタンが幅の広い画面用と狭い画面用に2つ描画される
 * （GeneratedImageList.tsx の actionButtons）。どちらも同じ処理なので先頭を押す。
 */
function clickApplyButton() {
  fireEvent.click(screen.getAllByRole("button", { name: "listApplyForNext" })[0]);
}

beforeEach(() => {
  mockPush.mockReset();
  window.sessionStorage.clear();
  // 同じ画面のフォームへ渡すときにスクロールする。jsdom には実装が無い
  Object.defineProperty(window, "scrollTo", {
    value: jest.fn(),
    writable: true,
    configurable: true,
  });
});

describe("「このイラストで生成」", () => {
  test("One-Tap Style の一覧で確定すると、画像を持ち越して Free Style を開く", () => {
    renderList("navigate-free");

    clickApplyButton();
    // 移動前に確認ダイアログを出す
    expect(
      screen.queryByRole("alertdialog", { name: "listApplyForNextConfirmTitle" })
    ).not.toBeNull();
    expect(mockPush).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "listApplyForNextConfirmOk" })
    );

    expect(window.sessionStorage.getItem(COORDINATE_PENDING_SOURCE_IMAGE_KEY)).toBe(
      IMAGE.url
    );
    // 見ている人のロケール付きで開く(proxy のロケール付与の転送を1回減らす)
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/en/free");
  });

  test("キャンセルしたら持ち越さず、移動もしない", () => {
    renderList("navigate-free");

    clickApplyButton();
    fireEvent.click(
      screen.getByRole("button", { name: "listApplyForNextConfirmCancel" })
    );

    expect(
      window.sessionStorage.getItem(COORDINATE_PENDING_SOURCE_IMAGE_KEY)
    ).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("同じ画面にフォームがある一覧では、移動せずに画像をフォームへ渡す", () => {
    const received: CoordinateApplyFromHistoryDetail[] = [];
    const listener = (event: Event) => {
      received.push((event as CustomEvent<CoordinateApplyFromHistoryDetail>).detail);
    };
    document.addEventListener(COORDINATE_APPLY_FROM_HISTORY_EVENT, listener);

    try {
      renderList("dispatch-event");
      clickApplyButton();
    } finally {
      document.removeEventListener(COORDINATE_APPLY_FROM_HISTORY_EVENT, listener);
    }

    expect(received).toEqual([{ imageUrl: IMAGE.url, fileNameHint: IMAGE.id }]);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
    expect(
      window.sessionStorage.getItem(COORDINATE_PENDING_SOURCE_IMAGE_KEY)
    ).toBeNull();
  });
});

/*
  確認ダイアログの見出し（coordinate.listApplyForNextConfirmTitle）。
  上のテストは翻訳をキーのまま返すので文言を見られない。行き先を Free Style に
  変えたのに見出しが「コーディネートに移動します」のままにならないよう、
  全言語で、その言語の Free Style のタブ名を名指ししていることを確かめる。
*/
describe("確認ダイアログの見出し", () => {
  test.each(locales.map((locale) => [locale]))(
    "%s: 行き先として Free Style を名指しする",
    async (locale) => {
      const messages = await getAllMessages(locale);

      expect(messages.coordinate.listApplyForNextConfirmTitle).toContain(
        messages.free.tabLabel
      );
    }
  );
});
