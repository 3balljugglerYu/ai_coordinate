/** @jest-environment jsdom */

/**
 * 拡大表示から投稿したあと、戻ったときに拡大表示が開いたまま残らないこと
 * (2026-10-15 ユーザー報告「投稿しても +20ペルコインの演出が出ない」)。
 *
 * 拡大表示の「＋ 投稿」は、移るあいだのちらつきを防ぐため拡大表示を開いたまま投稿用ページへ移る。
 * Next.js(cacheComponents)は戻ったときのために前の画面を隠して残す(React の Activity)ので、
 * 開いたままだと投稿して戻ったときに拡大表示(重なり順 9999)が投稿の演出を覆い、「×」で演出ごと閉じる。
 * ここでは Activity で「隠れる → 戻る」を再現する。
 */

const mockOpenPostPage = jest.fn();
jest.mock("@/features/posts/hooks/usePostPageNavigation", () => ({
  usePostPageNavigation: () => ({ isNavigating: false, openPostPage: mockOpenPostPage }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), prefetch: jest.fn() }),
}));

const stableTranslate = (key: string) => key;
jest.mock("next-intl", () => ({
  useLocale: () => "ja",
  useTranslations: () => stableTranslate,
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

jest.mock("@/features/generation/lib/download-image", () => ({
  shareOrDownloadGeneratedImage: jest.fn(),
}));

// lightbox は ESM のまま配布されていて jest が読めない。開いているかと「投稿」だけを持つ代わりにする
jest.mock("@/features/generation/components/ImageModal", () => ({
  ImageModal: ({
    images,
    initialIndex,
    onPost,
  }: {
    images: { id: string }[];
    initialIndex: number;
    onPost?: (image: { id: string }) => void;
  }) => (
    <div role="dialog" aria-label="viewer">
      <button type="button" onClick={() => onPost?.(images[initialIndex])}>
        viewer-post
      </button>
    </div>
  ),
}));

import { Activity, type ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { GeneratedImageGallery } from "@/features/generation/components/GeneratedImageGallery";
import { GeneratedImageList } from "@/features/generation/components/GeneratedImageList";
import type { GeneratedImageData } from "@/features/generation/types";

const IMAGE: GeneratedImageData = {
  id: "image-1",
  url: "https://example.test/storage/image-1.png",
  displayUrl: "https://example.test/storage/image-1_display.webp",
  is_posted: false,
  createdAt: "2026-10-15T00:00:00.000Z",
};

const VIEWS: { name: string; view: ReactNode }[] = [
  { name: "GeneratedImageGallery(グリッド)", view: <GeneratedImageGallery images={[IMAGE]} /> },
  {
    name: "GeneratedImageList(リスト)",
    view: (
      <GeneratedImageList
        images={[IMAGE]}
        detailFromParam="free"
        returnToImageIdKey="persta-ai:free-return-to-image-id"
        applyActionMode="dispatch-event"
        generationType="free"
      />
    ),
  },
];

function renderIn(mode: "visible" | "hidden", view: ReactNode) {
  return <Activity mode={mode}>{view}</Activity>;
}

async function openViewer() {
  await act(async()=>{}); // 投稿可否の本人確認を待つ(このテストの画像は審査対象外)
  fireEvent.click(screen.getAllByRole("button", { name: "previewAction" })[0]);
  expect(screen.getByRole("dialog", { name: "viewer" })).toBeTruthy();
}

beforeEach(() => {
  mockOpenPostPage.mockReset();
  global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({review:null})});
});

describe.each(VIEWS)("$name: 拡大表示から投稿して戻ったとき", ({ view }) => {
  test("投稿用ページへ移ったあと画面が隠れたら、拡大表示を閉じておく(戻ったときに演出を覆わない)", async () => {
    const { rerender } = render(renderIn("visible", view));
    await openViewer();

    fireEvent.click(screen.getByRole("button", { name: "viewer-post" }));
    expect(mockOpenPostPage).toHaveBeenCalledWith("image-1");
    // 移るあいだは開いたまま(閉じると下の一覧が一瞬見えてちらつく)
    expect(screen.getByRole("dialog", { name: "viewer" })).toBeTruthy();

    // 投稿用ページへ移って、この画面が隠れる → 投稿して戻る
    act(() => rerender(renderIn("hidden", view)));
    act(() => rerender(renderIn("visible", view)));

    expect(screen.queryByRole("dialog", { name: "viewer" })).toBeNull();
  });

  test("投稿しないで画面が隠れて戻ったときは、拡大表示はそのまま(戻ったときの状態は変えない)", async () => {
    const { rerender } = render(renderIn("visible", view));
    await openViewer();

    act(() => rerender(renderIn("hidden", view)));
    act(() => rerender(renderIn("visible", view)));

    expect(screen.getByRole("dialog", { name: "viewer" })).toBeTruthy();
  });

  test("一度閉じたあとは、次に隠れても戻っても開かない(印は1回で消える)", async () => {
    const { rerender } = render(renderIn("visible", view));
    await openViewer();
    fireEvent.click(screen.getByRole("button", { name: "viewer-post" }));
    act(() => rerender(renderIn("hidden", view)));
    act(() => rerender(renderIn("visible", view)));
    expect(screen.queryByRole("dialog", { name: "viewer" })).toBeNull();

    // もう一度開いて、投稿せずに隠れて戻る → 開いたまま
    await openViewer();
    act(() => rerender(renderIn("hidden", view)));
    act(() => rerender(renderIn("visible", view)));
    expect(screen.getByRole("dialog", { name: "viewer" })).toBeTruthy();
  });
});
