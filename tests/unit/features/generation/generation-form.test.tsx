import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { GenerationForm } from "@/features/generation/components/GenerationForm";
import { COORDINATE_STOCK_CREATED_EVENT } from "@/features/generation/hooks/useCoordinateStocksUnread";
import { COORDINATE_APPLY_FROM_HISTORY_EVENT } from "@/features/generation/lib/apply-from-history-event";
import {
  getSourceImageStocks,
  getStockImageLimit,
} from "@/features/generation/lib/database";
import { getCurrentUserId } from "@/features/generation/lib/current-user";
import { SELECTED_MODEL_STORAGE_KEY } from "@/features/generation/lib/form-preferences";
import { GENERATION_PROMPT_MAX_LENGTH } from "@/features/generation/lib/prompt-validation";

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

jest.mock("@/features/generation/components/ImageUploader", () => ({
  ImageUploader: ({
    onImageUpload,
  }: {
    onImageUpload: (image: {
      file: File;
      previewUrl: string;
      width: number;
      height: number;
    }) => void;
  }) => (
    <button
      type="button"
      data-testid="mock-add-upload"
      onClick={() =>
        onImageUpload({
          file: new File(["x"], "demo.png", { type: "image/png" }),
          previewUrl: "blob:mock",
          width: 100,
          height: 100,
        })
      }
    >
      add-upload
    </button>
  ),
}));

jest.mock("@/features/generation/components/StockImageListClient", () => ({
  StockImageListClient: ({
    stocks,
    selectedStockId,
  }: {
    stocks: Array<{ id: string; image_url: string; name?: string | null }>;
    selectedStockId?: string | null;
  }) => (
    <div data-testid="mock-stock-list">
      <div data-testid="mock-stock-count">{stocks.length}</div>
      {stocks.map((stock) => (
        <div
          key={stock.id}
          data-testid={`stock-${stock.id}`}
          data-selected={selectedStockId === stock.id ? "true" : "false"}
        >
          {stock.name ?? stock.image_url}
        </div>
      ))}
    </div>
  ),
}));

jest.mock("@/features/generation/components/StockImageUploadCard", () => ({
  StockImageUploadCard: () => <div>stock-image-upload-card</div>,
}));

jest.mock("@/features/generation/components/GeneratedImagesFromSource", () => ({
  GeneratedImagesFromSource: () => null,
}));

jest.mock("@/features/generation/lib/database", () => ({
  getSourceImageStocks: jest.fn(),
  getStockImageLimit: jest.fn(),
  getStocksTabUnreadState: jest.fn().mockResolvedValue({
    hasDot: false,
    latestStockCreatedAt: null,
  }),
  markStocksTabSeen: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/features/generation/lib/current-user", () => ({
  getCurrentUserId: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/features/generation/lib/model-config", () => ({
  getPercoinCost: jest.fn((model?: string) => {
    const costs: Record<string, number> = {
      "gemini-3.1-flash-image-preview-512": 10,
      "gemini-3.1-flash-image-preview-1024": 20,
      "gemini-3-pro-image-1k": 50,
      "gemini-3-pro-image-2k": 80,
      "gemini-3-pro-image-4k": 100,
      "gpt-image-2-low": 10,
    };
    return costs[model ?? ""] ?? 10;
  }),
  isCanonicalGuestAllowedModel: jest.fn((model?: string | null) =>
    model === "gpt-image-2-low" ||
    model === "gemini-3.1-flash-image-preview-512"
  ),
  resolveEffectiveModelForAuthState: jest.fn(
    (model: string, authState: "guest" | "authenticated") => {
      if (
        authState === "guest" &&
        model !== "gpt-image-2-low" &&
        model !== "gemini-3.1-flash-image-preview-512"
      ) {
        return "gpt-image-2-low";
      }
      return model;
    }
  ),
}));

const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;
const getSourceImageStocksMock = getSourceImageStocks as jest.MockedFunction<
  typeof getSourceImageStocks
>;
const getStockImageLimitMock = getStockImageLimit as jest.MockedFunction<
  typeof getStockImageLimit
>;
const getCurrentUserIdMock = getCurrentUserId as jest.MockedFunction<
  typeof getCurrentUserId
>;

const messages: Record<string, string> = {
  imageSourceLabel: "Choose source image",
  libraryTab: "Library",
  stockTab: "Stock",
  stockImagesLabel: "Stock images",
  addStockImageAction: "Add stock image",
  stockLimitReachedInline: "Limit reached.",
  sourceImageTypeLabel: "Source image type",
  sourceImageTypeIllustration: "Illustration",
  sourceImageTypeReal: "Photoreal",
  promptLabel: "Describe the outfit",
  promptPlaceholder: "Example outfit",
  promptHint:
    "Describe the outfit you want as specifically as possible in up to {max} characters.",
  promptCharacterCount: "{current}/{max} characters",
  promptClear: "Clear",
  promptTooLong: "Enter an outfit description within {max} characters.",
  backgroundLabel: "Background",
  backgroundAiAutoLabel: "Let AI decide",
  backgroundAiAutoDescription: "AI decides the background.",
  backgroundIncludeInPromptLabel: "Include it in the prompt",
  backgroundIncludeInPromptDescription: "Background is part of the prompt.",
  backgroundKeepLabel: "Keep current background",
  backgroundKeepDescription: "Keep the current background.",
  modelLabel: "Model",
  modelLight05k: "Light model: Nano Banana 2 | 0.5K (10 Percoins / image)",
  modelStandard1k: "Standard model: Nano Banana 2 | 1K (20 Percoins / image)",
  modelPro1k: "High-fidelity model: Nano Banana Pro | 1K (50 Percoins / image)",
  modelPro2k: "High-fidelity model: Nano Banana Pro | 2K (80 Percoins / image)",
  modelPro4k: "High-fidelity model: Nano Banana Pro | 4K (100 Percoins / image)",
  modelGptImage2Low: "Light model: ChatGPT Images 2.0 (10 Percoins / image)",
  countLabel: "Count",
  countSingle: "1 image",
  countMultiple: "{count} images",
  countCostDescription: "{count} images require {amount} Percoins",
  generatingButton: "Start styling",
  generatingButtonLoading: "Generating...",
  missingPrompt: "Enter an outfit description.",
  missingUploadedImage: "Upload a source image.",
  missingStockImage: "Select a stock image.",
};

function translate(
  namespace: string | undefined,
  key: string,
  values?: Record<string, string | number>,
) {
  if (namespace !== "coordinate") {
    return key;
  }

  const template = messages[key] ?? key;
  if (!values) {
    return template;
  }

  return Object.entries(values).reduce((message, [token, value]) => {
    return message.replace(`{${token}}`, String(value));
  }, template);
}

function getSubmitButton() {
  return screen.getByRole("button", {
    name: /Start styling|Generating\.\.\./i,
  });
}

describe("GenerationForm", () => {
  let originalWindowImage: typeof Image;

  beforeAll(() => {
    originalWindowImage = window.Image;
  });

  beforeEach(() => {
    class MockImage {
      onload: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      naturalWidth = 640;
      naturalHeight = 480;

      set src(_value: string) {
        window.setTimeout(() => {
          this.onload?.(new Event("load"));
        }, 0);
      }
    }

    Object.defineProperty(window, "Image", {
      configurable: true,
      writable: true,
      value: MockImage,
    });
    useTranslationsMock.mockImplementation((namespace?: string) => {
      return ((key: string, values?: Record<string, string | number>) =>
        translate(namespace, key, values)) as ReturnType<typeof useTranslations>;
    });
    getCurrentUserIdMock.mockResolvedValue(null);
    getSourceImageStocksMock.mockResolvedValue([]);
    getStockImageLimitMock.mockResolvedValue(0);
    window.alert = jest.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: jest.fn(() => "blob:mock-history"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: jest.fn(),
    });
    localStorage.clear();
  });

  afterEach(() => {
    Object.defineProperty(window, "Image", {
      configurable: true,
      writable: true,
      value: originalWindowImage,
    });
    jest.clearAllMocks();
  });

  test("表示_プロンプト上限と文字数表示を出す", async () => {
    // Spec: GENFORM-001
    await act(async () => {
      render(<GenerationForm subscriptionPlan="free" onSubmit={jest.fn()} />);
    });

    const textarea = screen.getByRole("textbox");

    expect(textarea).toHaveAttribute(
      "maxLength",
      String(GENERATION_PROMPT_MAX_LENGTH),
    );
    expect(
      screen.getByText(`0/${GENERATION_PROMPT_MAX_LENGTH} characters`),
    ).toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: "witch outfit" } });

    expect(screen.getByText("12/1500 characters")).toBeInTheDocument();
  });

  test("表示_プロンプト空の間は送信無効", async () => {
    // Spec: GENFORM-002
    const onSubmit = jest.fn();
    await act(async () => {
      render(<GenerationForm subscriptionPlan="free" onSubmit={onSubmit} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("mock-add-upload"));
    });

    expect(getSubmitButton()).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test("表示_プロンプト超過の間は送信無効", async () => {
    // Spec: GENFORM-003
    await act(async () => {
      render(<GenerationForm subscriptionPlan="free" onSubmit={jest.fn()} />);
    });

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "a".repeat(GENERATION_PROMPT_MAX_LENGTH + 1) },
    });

    expect(getSubmitButton()).toBeDisabled();
  });

  test("表示_アップロード未選択の間は送信無効", async () => {
    // Spec: GENFORM-004
    await act(async () => {
      render(<GenerationForm subscriptionPlan="free" onSubmit={jest.fn()} />);
    });

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "valid prompt" },
    });

    expect(getSubmitButton()).toBeDisabled();
  });

  test("表示_ストック未選択の間は送信無効", async () => {
    // Spec: GENFORM-005
    await act(async () => {
      render(<GenerationForm subscriptionPlan="free" onSubmit={jest.fn()} />);
    });

    fireEvent.click(screen.getByRole("button", { name: /Stock/i }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "valid prompt" },
    });

    expect(getSubmitButton()).toBeDisabled();
  });

  test("送信_アップロード有効の場合_onSubmitにペイロードを渡す", async () => {
    // Spec: GENFORM-006
    const onSubmit = jest.fn();
    await act(async () => {
      render(<GenerationForm subscriptionPlan="free" onSubmit={onSubmit} />);
    });

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "  nice coat  " },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("mock-add-upload"));
    });

    await act(async () => {
      fireEvent.click(getSubmitButton());
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      prompt: "nice coat",
      sourceImage: expect.any(File),
      sourceImageStockId: undefined,
      sourceImageType: "illustration",
      backgroundMode: "keep",
      count: 1,
      model: "gpt-image-2-low",
    });
  });

  test("入力_プロンプトクリアボタンで入力内容を消す", async () => {
    await act(async () => {
      render(<GenerationForm subscriptionPlan="free" onSubmit={jest.fn()} />);
    });

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "remove this prompt" } });

    const clearButton = screen.getByRole("button", { name: "Clear" });
    expect(clearButton).toBeEnabled();

    fireEvent.click(clearButton);

    expect(textarea).toHaveValue("");
    expect(clearButton).toBeDisabled();
  });

  test("履歴画像適用イベント_画像をアップロード欄に差し込み送信できる", async () => {
    const onSubmit = jest.fn();
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      blob: jest
        .fn()
        .mockResolvedValue(new Blob(["history"], { type: "image/webp" })),
    });
    Object.defineProperty(global, "fetch", {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    await act(async () => {
      render(<GenerationForm subscriptionPlan="free" onSubmit={onSubmit} />);
    });

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "reuse previous coordinate" },
    });

    await act(async () => {
      document.dispatchEvent(
        new CustomEvent(COORDINATE_APPLY_FROM_HISTORY_EVENT, {
          detail: {
            imageUrl: "https://example.com/history.webp",
            fileNameHint: "history-image",
          },
        }),
      );
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("https://example.com/history.webp");
    });
    await waitFor(() => {
      expect(getSubmitButton()).toBeEnabled();
    });

    await act(async () => {
      fireEvent.click(getSubmitButton());
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceImage: expect.objectContaining({
          name: "history-image.webp",
          type: "image/webp",
        }),
        sourceImageStockId: undefined,
      }),
    );
  });

  test("履歴画像適用イベント_画像取得に失敗した場合は入力状態を変えない", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      blob: jest.fn(),
    });
    Object.defineProperty(global, "fetch", {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    await act(async () => {
      render(<GenerationForm subscriptionPlan="free" onSubmit={jest.fn()} />);
    });

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "reuse previous coordinate" },
    });

    await act(async () => {
      document.dispatchEvent(
        new CustomEvent(COORDINATE_APPLY_FROM_HISTORY_EVENT, {
          detail: {
            imageUrl: "https://example.com/missing.png",
            fileNameHint: "missing-image",
          },
        }),
      );
    });

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[apply-from-history] 画像取得に失敗:",
        expect.any(Error),
      );
    });
    expect(getSubmitButton()).toBeDisabled();

    consoleErrorSpy.mockRestore();
  });

  test("履歴画像適用イベント_imageUrlが無い場合は何もしない", async () => {
    const fetchMock = jest.fn();
    Object.defineProperty(global, "fetch", {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    await act(async () => {
      render(<GenerationForm subscriptionPlan="free" onSubmit={jest.fn()} />);
    });

    await act(async () => {
      document.dispatchEvent(
        new CustomEvent(COORDINATE_APPLY_FROM_HISTORY_EVENT, {
          detail: {},
        }),
      );
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("履歴画像適用イベント_メタデータ欠落時は既定値でファイル化する", async () => {
    const onSubmit = jest.fn();
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      blob: jest
        .fn()
        .mockResolvedValue(new Blob(["history"], { type: "application" })),
    });
    Object.defineProperty(global, "fetch", {
      configurable: true,
      writable: true,
      value: fetchMock,
    });
    class ZeroSizeImage {
      onload: ((event: Event) => void) | null = null;
      naturalWidth = 0;
      naturalHeight = 0;

      set src(_value: string) {
        window.setTimeout(() => {
          this.onload?.(new Event("load"));
        }, 0);
      }
    }
    Object.defineProperty(window, "Image", {
      configurable: true,
      writable: true,
      value: ZeroSizeImage,
    });

    await act(async () => {
      render(<GenerationForm subscriptionPlan="free" onSubmit={onSubmit} />);
    });

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "reuse previous coordinate" },
    });

    await act(async () => {
      document.dispatchEvent(
        new CustomEvent(COORDINATE_APPLY_FROM_HISTORY_EVENT, {
          detail: {
            imageUrl: "https://example.com/history",
          },
        }),
      );
    });

    await waitFor(() => {
      expect(getSubmitButton()).toBeEnabled();
    });

    await act(async () => {
      fireEvent.click(getSubmitButton());
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceImage: expect.objectContaining({
          name: "coordinate-history.png",
          type: "application",
        }),
      }),
    );
  });

  test("履歴画像適用イベント_MIMEタイプが空の場合はpngとして扱う", async () => {
    const onSubmit = jest.fn();
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      blob: jest.fn().mockResolvedValue(new Blob(["history"])),
    });
    Object.defineProperty(global, "fetch", {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    await act(async () => {
      render(<GenerationForm subscriptionPlan="free" onSubmit={onSubmit} />);
    });

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "reuse previous coordinate" },
    });

    await act(async () => {
      document.dispatchEvent(
        new CustomEvent(COORDINATE_APPLY_FROM_HISTORY_EVENT, {
          detail: {
            imageUrl: "https://example.com/no-content-type",
            fileNameHint: "no-content-type",
          },
        }),
      );
    });

    await waitFor(() => {
      expect(getSubmitButton()).toBeEnabled();
    });

    await act(async () => {
      fireEvent.click(getSubmitButton());
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceImage: expect.objectContaining({
          name: "no-content-type.png",
          type: "image/png",
        }),
      }),
    );
  });

  test("履歴画像適用イベント_画像読み込み失敗時はobject URLを解放する", async () => {
    const revokeObjectURLMock = jest.fn();
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURLMock,
    });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      blob: jest
        .fn()
        .mockResolvedValue(new Blob(["history"], { type: "image/png" })),
    });
    Object.defineProperty(global, "fetch", {
      configurable: true,
      writable: true,
      value: fetchMock,
    });
    class ErrorImage {
      onload: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      set src(_value: string) {
        window.setTimeout(() => {
          this.onerror?.(new Event("error"));
        }, 0);
      }
    }
    Object.defineProperty(window, "Image", {
      configurable: true,
      writable: true,
      value: ErrorImage,
    });

    await act(async () => {
      render(<GenerationForm subscriptionPlan="free" onSubmit={jest.fn()} />);
    });

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "reuse previous coordinate" },
    });

    await act(async () => {
      document.dispatchEvent(
        new CustomEvent(COORDINATE_APPLY_FROM_HISTORY_EVENT, {
          detail: {
            imageUrl: "https://example.com/broken.png",
            fileNameHint: "broken-image",
          },
        }),
      );
    });

    await waitFor(() => {
      expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:mock-history");
    });
    expect(getSubmitButton()).toBeDisabled();
  });

  test("表示_既定モデルと必要ペルコインがChatGPT Images 2.0になる", async () => {
    await act(async () => {
      render(<GenerationForm subscriptionPlan="free" onSubmit={jest.fn()} />);
    });

    expect(
      screen.getByText("Light model: ChatGPT Images 2.0 (10 Percoins / image)")
    ).toBeInTheDocument();
    expect(
      screen.getByText("1 images require 10 Percoins")
    ).toBeInTheDocument();
  });

  test("送信_guestでlocalStorageに許可外モデルが残っていても実効モデルだけ既定値に丸める", async () => {
    const onSubmit = jest.fn();
    localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, "gemini-3-pro-image-4k");

    await act(async () => {
      render(
        <GenerationForm
          subscriptionPlan="free"
          onSubmit={onSubmit}
          authState="guest"
        />
      );
    });

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "guest prompt" },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("mock-add-upload"));
    });

    await act(async () => {
      fireEvent.click(getSubmitButton());
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-image-2-low",
      })
    );
    expect(localStorage.getItem(SELECTED_MODEL_STORAGE_KEY)).toBe(
      "gemini-3-pro-image-4k"
    );
  });

  test("表示_生成中は送信ボタン無効", async () => {
    // Spec: GENFORM-007
    await act(async () => {
      render(
        <GenerationForm
          subscriptionPlan="free"
          onSubmit={jest.fn()}
          isGenerating
        />
      );
    });

    expect(getSubmitButton()).toBeDisabled();
  });

  test("送信_チュートリアル中は進行イベントを送る", async () => {
    // Spec: GENFORM-008
    const dispatchSpy = jest.spyOn(document, "dispatchEvent");
    const onSubmit = jest.fn();
    const sessionGetItem = jest.fn((key: string) =>
      key === "tutorial_in_progress" ? "true" : null,
    );
    const origSession = window.sessionStorage;

    try {
      Object.defineProperty(window, "sessionStorage", {
        configurable: true,
        value: {
          length: 0,
          clear: jest.fn(),
          getItem: sessionGetItem,
          setItem: jest.fn(),
          removeItem: jest.fn(),
          key: jest.fn(),
        },
        writable: true,
      });

      await act(async () => {
        render(<GenerationForm subscriptionPlan="free" onSubmit={onSubmit} />);
      });

      fireEvent.change(screen.getByRole("textbox"), {
        target: { value: "tutorial prompt" },
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("mock-add-upload"));
      });

      await act(async () => {
        fireEvent.click(getSubmitButton());
      });

      expect(
        dispatchSpy.mock.calls.some(
          (c) =>
            c[0] instanceof CustomEvent &&
            c[0].type === "tutorial:advance-to-next",
        ),
      ).toBe(true);
      expect(onSubmit).toHaveBeenCalled();
    } finally {
      dispatchSpy.mockRestore();
      Object.defineProperty(window, "sessionStorage", {
        configurable: true,
        value: origSession,
        writable: true,
      });
    }
  });

  test("アップロード_新規ファイルでストック選択をストレージから消す", async () => {
    // Spec: GENFORM-009
    // 永続化キーは form-preferences.ts の SELECTED_STOCK_ID_STORAGE_KEY を使用し、
    // UUID 形式で保存される。
    const stockId = "11111111-1111-4111-8111-111111111111";
    const SELECTED_STOCK_ID_KEY = "persta-ai:last-selected-stock-id";
    localStorage.setItem(SELECTED_STOCK_ID_KEY, stockId);

    await act(async () => {
      render(<GenerationForm subscriptionPlan="free" onSubmit={jest.fn()} />);
    });

    expect(localStorage.getItem(SELECTED_STOCK_ID_KEY)).toBe(stockId);

    await act(async () => {
      fireEvent.click(screen.getByTestId("mock-add-upload"));
    });

    expect(localStorage.getItem(SELECTED_STOCK_ID_KEY)).toBeNull();
  });

  test("ストック保存イベント_ストック一覧を再取得し作成済み画像を即時表示する", async () => {
    // Spec: GENFORM-010
    const stockId = "22222222-2222-4222-8222-222222222222";
    const existingStock = {
      id: "11111111-1111-4111-8111-111111111111",
      user_id: "user-1",
      image_url: "https://example.com/existing-source.png",
      storage_path: "source/user-1/existing-source.png",
      name: "existing source",
      usage_count: 0,
      created_at: "2026-04-28T00:00:00.000Z",
      updated_at: "2026-04-28T00:00:00.000Z",
      last_used_at: null,
      deleted_at: null,
    };
    const savedStock = {
      id: stockId,
      user_id: "user-1",
      image_url: "https://example.com/source.png",
      storage_path: "source/user-1/source.png",
      name: "saved source",
      usage_count: 0,
      created_at: "2026-04-29T00:00:00.000Z",
      updated_at: "2026-04-29T00:00:00.000Z",
      last_used_at: null,
      deleted_at: null,
    };

    getCurrentUserIdMock.mockResolvedValue("user-1");
    getStockImageLimitMock.mockResolvedValue(5);
    getSourceImageStocksMock
      .mockResolvedValueOnce([existingStock])
      .mockResolvedValueOnce([existingStock, savedStock]);

    await act(async () => {
      render(<GenerationForm subscriptionPlan="free" onSubmit={jest.fn()} />);
    });
    await waitFor(() => {
      expect(getSourceImageStocksMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(COORDINATE_STOCK_CREATED_EVENT, {
          detail: { stockId },
        }),
      );
    });
    await waitFor(() => {
      expect(getSourceImageStocksMock).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole("button", { name: /Stock/i }));

    expect(screen.getByTestId(`stock-${stockId}`)).toHaveTextContent(
      "saved source",
    );
    expect(screen.getByTestId(`stock-${stockId}`)).toHaveAttribute(
      "data-selected",
      "true",
    );
    expect(
      screen
        .getByTestId("mock-stock-list")
        .querySelector('[data-testid^="stock-"]'),
    ).toBe(screen.getByTestId(`stock-${stockId}`));
  });

  test("ストック保存イベント_再取得中にストックタブを開いた場合は一覧表示を待機する", async () => {
    // Spec: GENFORM-011
    const stockId = "44444444-4444-4444-8444-444444444444";
    const savedStock = {
      id: stockId,
      user_id: "user-1",
      image_url: "https://example.com/source.png",
      storage_path: "source/user-1/source.png",
      name: "saved source",
      usage_count: 0,
      created_at: "2026-04-29T00:00:00.000Z",
      updated_at: "2026-04-29T00:00:00.000Z",
      last_used_at: null,
      deleted_at: null,
    };
    let resolveRefresh!: (
      stocks: Awaited<ReturnType<typeof getSourceImageStocks>>,
    ) => void;
    const refreshPromise = new Promise<
      Awaited<ReturnType<typeof getSourceImageStocks>>
    >((resolve) => {
      resolveRefresh = resolve;
    });

    getCurrentUserIdMock.mockResolvedValue("user-1");
    getStockImageLimitMock.mockResolvedValue(5);
    getSourceImageStocksMock
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(refreshPromise);

    await act(async () => {
      render(<GenerationForm subscriptionPlan="free" onSubmit={jest.fn()} />);
    });
    await waitFor(() => {
      expect(getSourceImageStocksMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(COORDINATE_STOCK_CREATED_EVENT, {
          detail: { stockId },
        }),
      );
    });
    await waitFor(() => {
      expect(getSourceImageStocksMock).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(screen.getByRole("button", { name: /Stock/i }));

    expect(screen.queryByTestId("mock-stock-list")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add stock image" }),
    ).toBeDisabled();

    await act(async () => {
      resolveRefresh([savedStock]);
      await refreshPromise;
    });

    await waitFor(() => {
      expect(screen.getByTestId(`stock-${stockId}`)).toHaveTextContent(
        "saved source",
      );
    });
  });

  test("ストックタブ_追加カードを出さず見出し横の追加ボタンを上限時は非活性にする", async () => {
    // Spec: GENFORM-012
    getCurrentUserIdMock.mockResolvedValue("user-1");
    getStockImageLimitMock.mockResolvedValue(1);
    getSourceImageStocksMock.mockResolvedValue([
      {
        id: "33333333-3333-4333-8333-333333333333",
        user_id: "user-1",
        image_url: "https://example.com/source.png",
        storage_path: "source/user-1/source.png",
        name: "source",
        usage_count: 0,
        created_at: "2026-04-29T00:00:00.000Z",
        updated_at: "2026-04-29T00:00:00.000Z",
        last_used_at: null,
        deleted_at: null,
      },
    ]);

    await act(async () => {
      render(<GenerationForm subscriptionPlan="free" onSubmit={jest.fn()} />);
    });
    await waitFor(() => {
      expect(getSourceImageStocksMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: /Stock/i }));

    expect(screen.queryByText("stock-image-upload-card")).not.toBeInTheDocument();
    expect(screen.getByText("Limit reached.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add stock image" }),
    ).toBeDisabled();
  });
});
