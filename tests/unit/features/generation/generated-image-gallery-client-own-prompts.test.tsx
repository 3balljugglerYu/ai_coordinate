/** @jest-environment jsdom */

/**
 * 生成結果一覧の続きの読み込み(下までスクロールしたとき)も、最初の読み込みと同じ条件で絞る。
 * CREATE(/free、カタログ刷新後)では、自分のプロンプトで作ったものだけ(派生生成を除く)。
 */

import React from "react";
import { render, waitFor } from "@testing-library/react";

// 一覧の下端が見えている状態にして、続きの読み込みをすぐ走らせる
jest.mock("react-intersection-observer", () => ({
  useInView: () => ({ ref: () => {}, inView: true }),
}));
const mockGetGeneratedImages = jest.fn<Promise<unknown[]>, unknown[]>(async () => []);
jest.mock("@/features/generation/lib/database", () => ({
  getGeneratedImages: (...args: unknown[]) => mockGetGeneratedImages(...args),
}));
jest.mock("@/features/generation/lib/current-user", () => ({
  getCurrentUserId: async () => "user-1",
}));
jest.mock("@/features/generation/context/GenerationStateContext", () => ({
  useGenerationState: () => null,
}));
jest.mock("@/features/generation/components/GeneratedImageGallery", () => ({
  GeneratedImageGallery: () => null,
}));
jest.mock("@/features/generation/components/GeneratedImageList", () => ({
  GeneratedImageList: () => null,
}));
jest.mock("@/features/generation/components/GalleryViewToggle", () => ({
  GalleryViewToggle: () => null,
}));

import { GeneratedImageGalleryClient } from "@/features/generation/components/GeneratedImageGalleryClient";

// 1ページ分(4件)あると「続きがある」とみなして読み込む
const INITIAL = ["a", "b", "c", "d"].map((id) => ({ id, url: `https://example.com/${id}.png` }));

function renderGallery(ownPromptsOnly?: boolean) {
  return render(
    <GeneratedImageGalleryClient
      initialImages={INITIAL as never}
      generationType="free"
      title="生成結果一覧"
      detailFromParam="free"
      returnToImageIdKey="k"
      applyActionMode="dispatch-event"
      ownPromptsOnly={ownPromptsOnly}
    />
  );
}

beforeEach(() => {
  mockGetGeneratedImages.mockClear();
});

describe("GeneratedImageGalleryClient の続きの読み込み", () => {
  test("自分のプロンプトだけの一覧なら、続きも派生生成を除いて読む", async () => {
    renderGallery(true);

    await waitFor(() => expect(mockGetGeneratedImages).toHaveBeenCalled());
    expect(mockGetGeneratedImages).toHaveBeenCalledWith("user-1", 4, 4, "free", {
      ownPromptsOnly: true,
    });
  });

  test("指定しなければ今までどおり(派生生成も含めて読む)", async () => {
    renderGallery();

    await waitFor(() => expect(mockGetGeneratedImages).toHaveBeenCalled());
    expect(mockGetGeneratedImages).toHaveBeenCalledWith("user-1", 4, 4, "free", {
      ownPromptsOnly: false,
    });
  });
});
