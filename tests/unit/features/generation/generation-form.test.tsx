import { act, fireEvent, render, screen } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { GenerationForm } from "@/features/generation/components/GenerationForm";
import { GENERATION_PROMPT_MAX_LENGTH } from "@/features/generation/lib/prompt-validation";

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

jest.mock("@/features/generation/components/ImageUploader", () => ({
  ImageUploader: () => <div>image-uploader</div>,
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
  getPercoinCost: jest.fn().mockReturnValue(20),
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
  modelStandard: "Standard",
  model1k: "1K",
  model2k: "2K",
  model4k: "4K",
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
  values?: Record<string, string | number>
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

describe("GenerationForm", () => {
  beforeEach(() => {
    useTranslationsMock.mockImplementation((namespace?: string) => {
      return ((key: string, values?: Record<string, string | number>) =>
        translate(namespace, key, values)) as ReturnType<typeof useTranslations>;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("プロンプト入力欄に1500文字制限と文字数表示を出す", async () => {
    await act(async () => {
      render(<GenerationForm onSubmit={jest.fn()} />);
    });

    const textarea = screen.getByRole("textbox");

    expect(textarea).toHaveAttribute(
      "maxLength",
      String(GENERATION_PROMPT_MAX_LENGTH)
    );
    expect(
      screen.getByText(`0/${GENERATION_PROMPT_MAX_LENGTH} characters`)
    ).toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: "witch outfit" } });

    expect(screen.getByText("12/1500 characters")).toBeInTheDocument();
  });
});
