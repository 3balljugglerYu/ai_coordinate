import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GenerationSubmitError } from "@/features/generation/lib/generation-submit-error";
import { useTranslations } from "next-intl";
import { GenerationFormContainer } from "@/features/generation/components/GenerationFormContainer";
import { GenerationStateProvider } from "@/features/generation/context/GenerationStateContext";
import {
  generateImageAsync,
  getInProgressJobs,
} from "@/features/generation/lib/async-api";
import { fetchPercoinBalance } from "@/features/credits/lib/api";
import { getCoordinateSourceStockSavePromptPending } from "@/features/generation/lib/coordinate-source-stock-save-prompt-state";

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  usePathname: () => "/coordinate",
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("@vercel/analytics/react", () => ({
  track: jest.fn(),
}));

const mockToast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

jest.mock("@/features/generation/components/GenerationForm", () => ({
  GenerationForm: ({
    onSubmit,
    isGenerating,
  }: {
    onSubmit: (data: {
      prompt: string;
      sourceImage: File;
      sourceImageType: "illustration";
      backgroundMode: "keep";
      count: number;
      model: "gpt-image-2-low-1k";
      generationType: "coordinate";
    }) => void;
    isGenerating: boolean;
  }) => (
    <button
      type="button"
      data-testid="submit-coordinate"
      disabled={isGenerating}
      onClick={() => {
        void onSubmit({
          prompt: "blue jacket",
          sourceImage: new File(["source"], "source.png", { type: "image/png" }),
          sourceImageType: "illustration",
          backgroundMode: "keep",
          count: 1,
          model: "gpt-image-2-low-1k",
          generationType: "coordinate",
        });
      }}
    >
      submit
    </button>
  ),
}));

jest.mock("@/features/generation/components/GenerationStatusCard", () => ({
  GenerationStatusCard: ({
    isComplete,
    progress,
    progressTransitionDurationMs,
    title,
  }: {
    isComplete: boolean;
    progress: number;
    progressTransitionDurationMs: number;
    title: string;
  }) => (
    <div
      data-complete={String(isComplete)}
      data-progress={String(progress)}
      data-transition-ms={String(progressTransitionDurationMs)}
      data-testid="generation-status-card"
    >
      {title}
    </div>
  ),
}));

jest.mock("@/features/generation/components/GuestResultPreview", () => ({
  GuestResultPreview: ({
    result,
  }: {
    result: { url: string; mimeType: string } | null;
  }) =>
    result ? (
      <div data-mime-type={result.mimeType} data-testid="guest-result-preview">
        {result.url}
      </div>
    ) : null,
}));

jest.mock("@/features/auth/components/AuthModal", () => ({
  AuthModal: () => null,
}));

jest.mock("@/features/generation/hooks/useCoordinateGenerationFeedback", () => ({
  useCoordinateGenerationFeedback: () => ({
    activeMessage: "",
    displayedMessage: "",
    activeHint: "",
    prefersReducedMotion: false,
  }),
}));

jest.mock("@/features/generation/lib/async-api", () => ({
  generateImageAsync: jest.fn(),
  getGenerationStatus: jest.fn(),
  getInProgressJobs: jest.fn(),
  pollGenerationStatus: jest.fn(),
}));

jest.mock("@/features/credits/lib/api", () => ({
  fetchPercoinBalance: jest.fn(),
}));

jest.mock("@/features/credits/constants", () => ({
  isPercoinInsufficientError: jest.fn(() => false),
}));

jest.mock("@/features/credits/lib/urls", () => ({
  getPercoinPurchaseUrl: jest.fn(() => "/my-page/percoin"),
}));

jest.mock("@/features/generation/lib/model-config", () => ({
  getPercoinCost: jest.fn(() => 10),
  isCanonicalGuestAllowedModel: jest.fn((model?: string | null) =>
    model === "gpt-image-2-low-1k"
  ),
  isModelAvailableForGeneration: jest.fn((model?: string | null) =>
    model === "gpt-image-2-low-1k"
  ),
  resolveEffectiveModelForAuthState: jest.fn(() => "gpt-image-2-low-1k"),
}));

jest.mock("@/features/generation/lib/coordinate-guest-api", () => ({
  submitGuestCoordinateGeneration: jest.fn(),
}));

jest.mock("@/features/generation/lib/coordinate-source-stock-save-prompt-state", () => ({
  getCoordinateSourceStockSavePromptPending: jest.fn(),
  showCoordinateSourceStockSavePrompt: jest.fn(),
}));

const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;
const generateImageAsyncMock = generateImageAsync as jest.MockedFunction<
  typeof generateImageAsync
>;
const getInProgressJobsMock = getInProgressJobs as jest.MockedFunction<
  typeof getInProgressJobs
>;
const fetchPercoinBalanceMock = fetchPercoinBalance as jest.MockedFunction<
  typeof fetchPercoinBalance
>;
const getPromptPendingMock =
  getCoordinateSourceStockSavePromptPending as jest.MockedFunction<
    typeof getCoordinateSourceStockSavePromptPending
  >;

function renderContainer() {
  return render(
    <GenerationStateProvider>
      <GenerationFormContainer subscriptionPlan="free" />
    </GenerationStateProvider>
  );
}

describe("受付で断られたときの知らせ方(2026-10-12)", () => {
  beforeEach(() => {
    useTranslationsMock.mockImplementation(() => {
      return ((key: string) => key) as ReturnType<typeof useTranslations>;
    });
    getInProgressJobsMock.mockReturnValue(new Promise<never>(() => undefined));
    fetchPercoinBalanceMock.mockResolvedValue({ balance: 1000 });
    getPromptPendingMock.mockReturnValue(false);
    mockToast.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("文字入力の文字で断られたときは、スナックバーだけで知らせる(ボタンの下には出さない)", async () => {
    generateImageAsyncMock.mockRejectedValue(
      new GenerationSubmitError("一部、ご利用いただけない表現があるようです。", "GENERATION_TEXT_INPUT_FLAGGED"),
    );
    renderContainer();
    fireEvent.click(screen.getByTestId("submit-coordinate"));

    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    expect(mockToast.mock.calls.at(-1)![0]).toMatchObject({ variant: "destructive", title: "generationFailedTitle" });
    expect(screen.queryByText("一部、ご利用いただけない表現があるようです。")).toBeNull();
  });

  test("ほかの理由で断られたときは、これまでどおりボタンの下にも出す", async () => {
    generateImageAsyncMock.mockRejectedValue(new GenerationSubmitError("不正なリクエストです", "GENERATION_INVALID_REQUEST"));
    renderContainer();
    fireEvent.click(screen.getByTestId("submit-coordinate"));

    await waitFor(() => expect(screen.getByText("不正なリクエストです")).toBeTruthy());
    expect(mockToast).toHaveBeenCalled();
  });
});
