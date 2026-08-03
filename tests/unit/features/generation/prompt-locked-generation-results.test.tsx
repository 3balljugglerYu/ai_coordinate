/**
 * 派生生成シートの結果一覧のテスト。
 *
 * ここが無かったために「生成しても完成画像が出ない」状態になっていた。
 * プロバイダに積まれた previewImages を必ず描画することを固定する。
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { PromptLockedGenerationResults } from "@/features/generation/components/PromptLockedGenerationResults";
import { useGenerationState } from "@/features/generation/context/GenerationStateContext";
import { getGeneratedImages } from "@/features/generation/lib/database";
import type { GeneratedImageData } from "@/features/generation/types";

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

jest.mock("@/features/generation/context/GenerationStateContext", () => ({
  useGenerationState: jest.fn(),
}));

jest.mock("@/features/generation/lib/database", () => ({
  getGeneratedImages: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/features/auth/lib/auth-client", () => ({
  getCurrentUser: jest.fn().mockResolvedValue({ id: "user-1" }),
}));

jest.mock("@/features/generation/components/GeneratedImageGallery", () => ({
  GeneratedImageGallery: ({
    images,
    isGenerating,
    generatingCount,
    generationType,
  }: {
    images: GeneratedImageData[];
    isGenerating: boolean;
    generatingCount: number;
    generationType?: string | null;
  }) => (
    <div
      data-testid="gallery"
      data-count={images.length}
      data-generating={String(isGenerating)}
      data-generating-count={generatingCount}
      data-generation-type={generationType ?? ""}
    />
  ),
}));

const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;
const useGenerationStateMock = useGenerationState as jest.MockedFunction<
  typeof useGenerationState
>;
const getGeneratedImagesMock = getGeneratedImages as jest.MockedFunction<
  typeof getGeneratedImages
>;

function buildImage(id: string): GeneratedImageData {
  return { id, url: `https://cdn.example/${id}.webp`, is_posted: false };
}

/** テストで使う分だけのプロバイダ値。実体は多数のフィールドを持つ。 */
function stubState(partial: {
  previewImages?: GeneratedImageData[];
  isGenerating?: boolean;
  generatingCount?: number;
}) {
  return {
    previewImages: partial.previewImages ?? [],
    isGenerating: partial.isGenerating ?? false,
    generatingCount: partial.generatingCount ?? 0,
  } as unknown as ReturnType<typeof useGenerationState>;
}

beforeEach(() => {
  jest.clearAllMocks();
  getGeneratedImagesMock.mockResolvedValue([]);
  useTranslationsMock.mockReturnValue(
    ((key: string) =>
      key === "resultsTitle" ? "生成結果一覧" : key) as unknown as ReturnType<
      typeof useTranslations
    >
  );
});

describe("生成結果の描画", () => {
  it("生成済みの画像を一覧に渡す", () => {
    useGenerationStateMock.mockReturnValue(
      stubState({ previewImages: [buildImage("a"), buildImage("b")] })
    );

    render(<PromptLockedGenerationResults />);

    expect(screen.getByTestId("gallery")).toHaveAttribute("data-count", "2");
    expect(screen.getByText("生成結果一覧")).toBeInTheDocument();
  });

  it("生成中は画像が無くても一覧を出す", () => {
    // 進捗表示の置き場所が無いと、押しても何も起きていないように見える
    useGenerationStateMock.mockReturnValue(
      stubState({ isGenerating: true, generatingCount: 1 })
    );

    render(<PromptLockedGenerationResults />);

    const gallery = screen.getByTestId("gallery");
    expect(gallery).toHaveAttribute("data-generating", "true");
    expect(gallery).toHaveAttribute("data-generating-count", "1");
  });

  it("生成前は何も出さない", () => {
    // 空の見出しだけが残ると、失敗したように見える
    useGenerationStateMock.mockReturnValue(stubState({}));

    const { container } = render(<PromptLockedGenerationResults />);

    expect(container).toBeEmptyDOMElement();
  });

  it("プロバイダが無くても落ちない", () => {
    // シート外で誤って使われたときに画面ごと壊さない
    useGenerationStateMock.mockReturnValue(null);

    const { container } = render(<PromptLockedGenerationResults />);

    expect(container).toBeEmptyDOMElement();
  });

  it("一覧へ free を渡す", () => {
    // 投稿モーダルの「プロンプトを公開する」トグルの出し分けに使われる。
    // 渡さないと、派生生成の結果を投稿するときにトグルが出ない。
    useGenerationStateMock.mockReturnValue(
      stubState({ previewImages: [buildImage("a")] })
    );

    render(<PromptLockedGenerationResults />);

    expect(screen.getByTestId("gallery")).toHaveAttribute(
      "data-generation-type",
      "free"
    );
  });
});

describe("過去のじゆうモード生成", () => {
  it("直近の生成も一覧へ並べる", async () => {
    // シートで作った分だけだと、閉じたあとどこへ行ったか分からない
    useGenerationStateMock.mockReturnValue(stubState({}));
    getGeneratedImagesMock.mockResolvedValue([
      {
        id: "past-1",
        user_id: "user-1",
        image_url: "https://cdn.example/past-1.webp",
        storage_path: "p1",
        prompt: "",
        is_posted: true,
      },
    ]);

    render(<PromptLockedGenerationResults />);

    await waitFor(() => {
      expect(screen.getByTestId("gallery")).toHaveAttribute("data-count", "1");
    });
  });

  it("じゆうモードだけを引く", async () => {
    useGenerationStateMock.mockReturnValue(stubState({}));

    render(<PromptLockedGenerationResults />);

    await waitFor(() => {
      expect(getGeneratedImagesMock).toHaveBeenCalledWith(
        "user-1",
        4,
        0,
        "free"
      );
    });
  });

  it("新しく作った分を先頭に置く", async () => {
    // 生成直後に DB からも引けた場合、進捗つきのプレビュー側を優先する
    useGenerationStateMock.mockReturnValue(
      stubState({ previewImages: [buildImage("same")] })
    );
    getGeneratedImagesMock.mockResolvedValue([
      {
        id: "same",
        user_id: "user-1",
        image_url: "https://cdn.example/from-db.webp",
        storage_path: "p",
        prompt: "",
        is_posted: false,
      },
    ]);

    render(<PromptLockedGenerationResults />);

    await waitFor(() => {
      // 重複は畳まれて1件のまま
      expect(screen.getByTestId("gallery")).toHaveAttribute("data-count", "1");
    });
  });

  it("取得に失敗しても落ちない", async () => {
    useGenerationStateMock.mockReturnValue(
      stubState({ previewImages: [buildImage("a")] })
    );
    getGeneratedImagesMock.mockRejectedValue(new Error("network"));

    render(<PromptLockedGenerationResults />);

    await waitFor(() => {
      expect(screen.getByTestId("gallery")).toHaveAttribute("data-count", "1");
    });
  });
});
