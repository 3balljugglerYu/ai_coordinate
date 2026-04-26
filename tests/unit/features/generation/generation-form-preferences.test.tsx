/** @jest-environment jsdom */

import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { GenerationForm } from "@/features/generation/components/GenerationForm";
import {
  BACKGROUND_MODE_STORAGE_KEY,
  SELECTED_MODEL_STORAGE_KEY,
} from "@/features/generation/lib/form-preferences";

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

jest.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value?: string;
    onValueChange?: (value: string) => void;
    disabled?: boolean;
    children: React.ReactNode;
  }) => (
    <select
      data-testid="model-select"
      value={value}
      disabled={disabled}
      onChange={(event) => onValueChange?.(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
}));

jest.mock("@/components/ui/radio-group", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const RadioContext = React.createContext<{
    value?: string;
    onValueChange?: (value: string) => void;
    disabled?: boolean;
  }>({});

  return {
    RadioGroup: ({
      value,
      onValueChange,
      disabled,
      children,
    }: {
      value?: string;
      onValueChange?: (value: string) => void;
      disabled?: boolean;
      children: React.ReactNode;
    }) => (
      <RadioContext.Provider value={{ value, onValueChange, disabled }}>
        <div>{children}</div>
      </RadioContext.Provider>
    ),
    RadioGroupItem: ({
      id,
      value,
      className,
    }: {
      id?: string;
      value: string;
      className?: string;
    }) => {
      const context = React.useContext(RadioContext);
      return (
        <input
          id={id}
          className={className}
          type="radio"
          checked={context.value === value}
          disabled={context.disabled}
          onChange={() => context.onValueChange?.(value)}
        />
      );
    },
  };
});

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
  isCanonicalGuestAllowedModel: jest.fn((model: string) =>
    ["gpt-image-2-low", "gemini-3.1-flash-image-preview-512"].includes(model),
  ),
  resolveEffectiveModelForAuthState: jest.fn(
    (model: string, authState: "guest" | "authenticated") => {
      if (
        authState === "guest" &&
        !["gpt-image-2-low", "gemini-3.1-flash-image-preview-512"].includes(
          model,
        )
      ) {
        return "gpt-image-2-low";
      }
      return model;
    },
  ),
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
  promptHint: "Describe the outfit in up to {max} characters.",
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
  if (namespace !== "coordinate") return key;
  const template = messages[key] ?? key;
  if (!values) return template;
  return Object.entries(values).reduce((message, [token, value]) => {
    return message.replace(`{${token}}`, String(value));
  }, template);
}

describe("GenerationForm persisted preferences", () => {
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

  it("restores persisted model and background mode for submit payloads", async () => {
    localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, "gpt-image-2-low");
    localStorage.setItem(BACKGROUND_MODE_STORAGE_KEY, "ai_auto");
    const onSubmit = jest.fn();

    await act(async () => {
      render(<GenerationForm subscriptionPlan="free" onSubmit={onSubmit} />);
    });

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "saved preference outfit" },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("mock-add-upload"));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Start styling/i }));
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        backgroundMode: "ai_auto",
        model: "gpt-image-2-low",
      }),
    );
  });

  it("persists model and background changes made by the user", async () => {
    await act(async () => {
      render(<GenerationForm subscriptionPlan="free" onSubmit={jest.fn()} />);
    });

    fireEvent.change(screen.getByTestId("model-select"), {
      target: { value: "gemini-3-pro-image-4k" },
    });
    fireEvent.click(screen.getByLabelText("Include it in the prompt"));

    expect(localStorage.getItem(SELECTED_MODEL_STORAGE_KEY)).toBe(
      "gemini-3-pro-image-4k",
    );
    expect(localStorage.getItem(BACKGROUND_MODE_STORAGE_KEY)).toBe(
      "include_in_prompt",
    );
  });
});
