/**
 * 派生生成シートの結果一覧のテスト。
 *
 * ここが無かったために「生成しても完成画像が出ない」状態になっていた。
 * プロバイダに積まれた previewImages を必ず描画することを固定する。
 */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

// リスト表示に渡った props を見る
const listSpy = jest.fn();
jest.mock("@/features/generation/components/GeneratedImageList", () => ({
  GeneratedImageList: (props: { images: unknown[] }) => {
    listSpy(props);
    return <div data-testid="list" data-count={props.images.length} />;
  },
}));

// カタログ刷新(公開前は運営だけ)の可否。既定は刷新前(一般の利用者)
const mockRevamp = jest.fn<boolean, []>(() => false);
jest.mock("@/features/style-presets/hooks/useStylesCatalogRevamp", () => ({
  useStylesCatalogRevamp: () => mockRevamp(),
}));

// 続きの目印が見えているか。テストごとに切り替える
let mockInView = false;
jest.mock("react-intersection-observer", () => ({
  useInView: () => ({ ref: jest.fn(), inView: mockInView }),
}));

jest.mock("@/features/generation/components/GeneratedImageGallery", () => ({
  GeneratedImageGallery: ({
    images,
    isGenerating,
    generatingCount,
  }: {
    images: GeneratedImageData[];
    isGenerating: boolean;
    generatingCount: number;
  }) => (
    <div
      data-testid="gallery"
      data-count={images.length}
      data-generating={String(isGenerating)}
      data-generating-count={generatingCount}
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

  it("一覧へ generationType を渡さない（投稿ページが DB から引くため）", () => {
    /*
      以前はここから投稿モーダルへ generationType を流し、「プロンプトを
      公開する」トグルの出し分けに使っていた。投稿フォームを専用ページに
      移したあとは、ページ側が generated_images.generation_type を読むので
      クライアントから渡す必要がない。DB が正本になったぶん確実になった。

      トグルが出ることの保証は
      tests/unit/features/posts/post-composer-page.test.tsx が引き継ぐ。
    */
    useGenerationStateMock.mockReturnValue(
      stubState({ previewImages: [buildImage("a")] })
    );

    render(<PromptLockedGenerationResults />);

    expect(screen.getByTestId("gallery")).not.toHaveAttribute(
      "data-generation-type"
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
        "free",
        // 一般の利用者はカタログで絞らない
        { catalogDerivedOnly: false }
      );
    });
  });

  it("/styles の生成シートでは One-Tap Style の生成を引き、見出しも One-Tap Style 側にする", async () => {
    useGenerationStateMock.mockReturnValue(
      stubState({ previewImages: [buildImage("a")] })
    );
    useTranslationsMock.mockImplementation(
      ((namespace?: string) =>
        (key: string) =>
          key === "resultsTitle"
            ? namespace === "style"
              ? "生成結果"
              : "生成結果一覧"
            : key) as unknown as typeof useTranslations
    );

    render(<PromptLockedGenerationResults generationType="one_tap_style" />);

    expect(screen.getByText("生成結果")).toBeTruthy();
    await waitFor(() => {
      expect(getGeneratedImagesMock).toHaveBeenCalledWith(
        "user-1",
        4,
        0,
        "one_tap_style",
        // 一般の利用者はカタログで絞らない
        { catalogDerivedOnly: false }
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

/*
  カタログ刷新後(公開前は運営だけ)の「カタログから生成」のシート。
  そのカタログで作ったもの全部を並べ(開いたスタイルや投稿には絞らない)、
  下へ進むと続きを読み込む(2026-09-30 ユーザー決定)。
*/
describe("カタログ刷新後: そのカタログで作ったもの全部を、ページごとに読む", () => {
  function record(id: string) {
    return {
      id,
      user_id: "user-1",
      image_url: `https://cdn.example/${id}.webp`,
      storage_path: id,
      prompt: "",
      is_posted: false,
    };
  }
  const page = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, index) => record(`${prefix}-${index}`));

  beforeEach(() => {
    mockRevamp.mockReturnValue(true);
    mockInView = false;
    useGenerationStateMock.mockReturnValue(stubState({}));
  });
  afterEach(() => {
    mockRevamp.mockReturnValue(false);
    mockInView = false;
  });

  it("User ORIGINAL のシートは、みんなのカタログを使って作ったもの全部を8件ずつ引く", async () => {
    render(<PromptLockedGenerationResults />);

    await waitFor(() => {
      expect(getGeneratedImagesMock).toHaveBeenCalledWith("user-1", 8, 0, "free", {
        catalogDerivedOnly: true,
      });
    });
  });

  it("Persta ORIGINAL のシートは、One-Tap Style の生成全部を引く(スタイルで絞らない)", async () => {
    render(<PromptLockedGenerationResults generationType="one_tap_style" />);

    await waitFor(() => {
      expect(getGeneratedImagesMock).toHaveBeenCalledWith("user-1", 8, 0, "one_tap_style", {
        catalogDerivedOnly: false,
      });
    });
  });

  it("1ページぶん(8件)あれば続きの目印を置き、見えたら次の8件を足す", async () => {
    getGeneratedImagesMock
      .mockResolvedValueOnce(page("first", 8))
      .mockResolvedValueOnce(page("second", 3));

    const { rerender } = render(<PromptLockedGenerationResults />);
    await waitFor(() => {
      expect(screen.getByTestId("gallery").getAttribute("data-count")).toBe("8");
    });
    expect(screen.getByTestId("prompt-locked-results-more")).toBeTruthy();

    mockInView = true;
    rerender(<PromptLockedGenerationResults />);

    await waitFor(() => {
      expect(screen.getByTestId("gallery").getAttribute("data-count")).toBe("11");
    });
    expect(getGeneratedImagesMock).toHaveBeenLastCalledWith("user-1", 8, 8, "free", {
      catalogDerivedOnly: true,
    });
    // 8件に満たなければ、それで終わり(目印を消す)
    expect(screen.queryByTestId("prompt-locked-results-more")).toBeNull();
  });

  it("1ページに満たなければ、続きの目印を置かない", async () => {
    getGeneratedImagesMock.mockResolvedValueOnce(page("only", 5));

    render(<PromptLockedGenerationResults />);

    await waitFor(() => {
      expect(screen.getByTestId("gallery").getAttribute("data-count")).toBe("5");
    });
    expect(screen.queryByTestId("prompt-locked-results-more")).toBeNull();
  });

  it("続きの読み込みに失敗したら、読み込み中を残さず止める", async () => {
    getGeneratedImagesMock
      .mockResolvedValueOnce(page("first", 8))
      .mockRejectedValueOnce(new Error("network"));

    const { rerender } = render(<PromptLockedGenerationResults />);
    await waitFor(() => {
      expect(screen.getByTestId("prompt-locked-results-more")).toBeTruthy();
    });

    mockInView = true;
    rerender(<PromptLockedGenerationResults />);

    await waitFor(() => {
      expect(screen.queryByTestId("prompt-locked-results-more")).toBeNull();
    });
    expect(screen.getByTestId("gallery").getAttribute("data-count")).toBe("8");
  });

  it("⭐一般の利用者は、最新4件だけで続きを読まない", async () => {
    mockRevamp.mockReturnValue(false);
    getGeneratedImagesMock.mockResolvedValueOnce(page("recent", 4));

    render(<PromptLockedGenerationResults />);

    await waitFor(() => {
      expect(screen.getByTestId("gallery").getAttribute("data-count")).toBe("4");
    });
    expect(getGeneratedImagesMock).toHaveBeenCalledWith("user-1", 4, 0, "free", {
      catalogDerivedOnly: false,
    });
    expect(screen.queryByTestId("prompt-locked-results-more")).toBeNull();
  });
});

/*
  カタログ刷新後は、/style の一覧と同じくグリッドとリストを切り替えられる(2026-09-30 ユーザー依頼)。
  選んだ表示は /coordinate・/free・/style と同じ場所に覚える。
*/
describe("カタログ刷新後: グリッドとリストの切り替え", () => {
  const STORAGE_KEY = "persta-ai:coordinate-gallery-view";

  beforeEach(() => {
    mockRevamp.mockReturnValue(true);
    window.localStorage.clear();
    useGenerationStateMock.mockReturnValue(stubState({ previewImages: [buildImage("a")] }));
  });
  afterEach(() => {
    mockRevamp.mockReturnValue(false);
    window.localStorage.clear();
  });

  it("切り替えのボタンを出し、リストを選ぶとリスト表示にして覚える", () => {
    render(<PromptLockedGenerationResults />);

    expect(screen.getByTestId("gallery")).toBeTruthy();
    const buttons = screen.getAllByRole("button");
    const listButton = buttons.find((button) => button.getAttribute("aria-pressed") === "false");
    expect(listButton).toBeTruthy();
    fireEvent.click(listButton as HTMLElement);

    expect(screen.getByTestId("list")).toBeTruthy();
    expect(screen.queryByTestId("gallery")).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("list");
  });

  it("前に選んだ表示(リスト)で開く", () => {
    window.localStorage.setItem(STORAGE_KEY, "list");

    render(<PromptLockedGenerationResults />);

    expect(screen.getByTestId("list")).toBeTruthy();
  });

  it("User ORIGINAL のシートの「このイラストで生成」は、シートの中のフォームへ渡す", () => {
    window.localStorage.setItem(STORAGE_KEY, "list");

    render(<PromptLockedGenerationResults />);

    expect(listSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        applyActionMode: "dispatch-event",
        detailFromParam: "free",
        generationType: "free",
        returnToImageIdKey: "persta-ai:catalog-sheet-return-to-image-id",
      })
    );
  });

  it("Persta ORIGINAL のシートの「このイラストで生成」は、/style と同じく /free へ移る", () => {
    window.localStorage.setItem(STORAGE_KEY, "list");

    render(
      <PromptLockedGenerationResults generationType="one_tap_style" />
    );

    expect(listSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        applyActionMode: "navigate-free",
        detailFromParam: "style",
        generationType: "one_tap_style",
      })
    );
  });

  it("⭐一般の利用者には切り替えを出さず、覚えた表示がリストでもグリッドのまま", () => {
    mockRevamp.mockReturnValue(false);
    window.localStorage.setItem(STORAGE_KEY, "list");

    render(<PromptLockedGenerationResults />);

    expect(screen.getByTestId("gallery")).toBeTruthy();
    expect(screen.queryByTestId("list")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
