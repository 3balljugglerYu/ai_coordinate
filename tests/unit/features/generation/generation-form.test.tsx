import { act, fireEvent, render, screen } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { GenerationForm } from "@/features/generation/components/GenerationForm";
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
  StockImageListClient: () => <div>stock-image-list</div>,
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
}));

const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;

const messages: Record<string, string> = {
  imageSourceLabel: "Choose source image",
  libraryTab: "Library",
  stockTab: "Stock",
  sourceImageTypeLabel: "Source image type",
  sourceImageTypeIllustration: "Illustration",
  sourceImageTypeReal: "Photoreal",
  promptLabel: "Describe the outfit",
  promptPlaceholder: "Example outfit",
  promptHint:
    "Describe the outfit you want as specifically as possible in up to {max} characters.",
  promptCharacterCount: "{current}/{max} characters",
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
  beforeEach(() => {
    useTranslationsMock.mockImplementation((namespace?: string) => {
      return ((key: string, values?: Record<string, string | number>) =>
        translate(namespace, key, values)) as ReturnType<typeof useTranslations>;
    });
    window.alert = jest.fn();
    localStorage.clear();
  });

  afterEach(() => {
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
    localStorage.setItem("selectedStockId", "stock-abc");

    await act(async () => {
      render(<GenerationForm subscriptionPlan="free" onSubmit={jest.fn()} />);
    });

    expect(localStorage.getItem("selectedStockId")).toBe("stock-abc");

    await act(async () => {
      fireEvent.click(screen.getByTestId("mock-add-upload"));
    });

    expect(localStorage.getItem("selectedStockId")).toBeNull();
  });
});
