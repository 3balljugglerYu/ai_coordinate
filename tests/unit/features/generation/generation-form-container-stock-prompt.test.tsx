import { act, fireEvent, render, screen } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { GenerationFormContainer } from "@/features/generation/components/GenerationFormContainer";
import { GenerationStateProvider } from "@/features/generation/context/GenerationStateContext";
import {
  generateImageAsync,
  getInProgressJobs,
  pollGenerationStatus,
} from "@/features/generation/lib/async-api";
import { fetchPercoinBalance } from "@/features/credits/lib/api";
import {
  getCoordinateSourceStockSavePromptPending,
  showCoordinateSourceStockSavePrompt,
} from "@/features/generation/lib/coordinate-source-stock-save-prompt-state";
import { COORDINATE_STOCK_SAVE_PROMPT_DISMISSED_STORAGE_KEY } from "@/features/generation/lib/form-preferences";
import { TUTORIAL_STORAGE_KEYS } from "@/features/tutorial/types";

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

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
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
      model: "gpt-image-2-low";
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
          model: "gpt-image-2-low",
          generationType: "coordinate",
        });
      }}
    >
      submit
    </button>
  ),
}));

jest.mock("@/features/generation/components/GenerationStatusCard", () => ({
  GenerationStatusCard: () => <div data-testid="generation-status-card" />,
}));

jest.mock("@/features/generation/components/GuestResultPreview", () => ({
  GuestResultPreview: () => null,
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
const pollGenerationStatusMock = pollGenerationStatus as jest.MockedFunction<
  typeof pollGenerationStatus
>;
const fetchPercoinBalanceMock = fetchPercoinBalance as jest.MockedFunction<
  typeof fetchPercoinBalance
>;
const getPromptPendingMock =
  getCoordinateSourceStockSavePromptPending as jest.MockedFunction<
    typeof getCoordinateSourceStockSavePromptPending
  >;
const showPromptMock = showCoordinateSourceStockSavePrompt as jest.MockedFunction<
  typeof showCoordinateSourceStockSavePrompt
>;

type ScheduledTimeout = {
  id: number;
  delay?: number;
  handler: TimerHandler;
};
type WindowTimeoutId = ReturnType<typeof window.setTimeout>;

let scheduledTimeouts: ScheduledTimeout[] = [];
let nextTimeoutId = 1;
let setTimeoutSpy: jest.SpyInstance;
let clearTimeoutSpy: jest.SpyInstance;
let performanceNowSpy: jest.SpyInstance;
let consoleErrorSpy: jest.SpyInstance;
let realSetTimeout: typeof window.setTimeout;
let realClearTimeout: typeof window.clearTimeout;
let realConsoleError: typeof console.error;

function renderContainer() {
  return render(
    <GenerationStateProvider>
      <GenerationFormContainer subscriptionPlan="free" />
    </GenerationStateProvider>
  );
}

async function flushSubmitWork() {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
}

async function startGeneration() {
  const view = renderContainer();

  fireEvent.click(screen.getByTestId("submit-coordinate"));
  await flushSubmitWork();

  expect(generateImageAsyncMock).toHaveBeenCalledTimes(1);
  expect(pollGenerationStatusMock).toHaveBeenCalledTimes(1);

  return view;
}

function getStockPromptTimer() {
  const timer = scheduledTimeouts.find((scheduled) => scheduled.delay === 3000);
  expect(timer).toBeDefined();
  return timer as ScheduledTimeout;
}

function fireScheduledTimeout(timer: ScheduledTimeout) {
  act(() => {
    if (typeof timer.handler === "function") {
      timer.handler();
    }
  });
}

describe("GenerationFormContainer stock prompt timer", () => {
  beforeEach(() => {
    scheduledTimeouts = [];
    nextTimeoutId = 1;
    realSetTimeout = window.setTimeout.bind(window);
    realClearTimeout = window.clearTimeout.bind(window);
    setTimeoutSpy = jest
      .spyOn(window, "setTimeout")
      .mockImplementation(((handler: TimerHandler, delay?: number) => {
        if (delay !== 3000) {
          return realSetTimeout(
            handler as Parameters<typeof window.setTimeout>[0],
            delay
          );
        }

        const id = -nextTimeoutId;
        nextTimeoutId += 1;
        scheduledTimeouts.push({ id, delay, handler });
        return id as unknown as WindowTimeoutId;
      }) as typeof window.setTimeout);
    clearTimeoutSpy = jest
      .spyOn(window, "clearTimeout")
      .mockImplementation(((id?: Parameters<typeof window.clearTimeout>[0]) => {
        if (typeof id !== "number" || id >= 0) {
          realClearTimeout(id);
          return;
        }

        scheduledTimeouts = scheduledTimeouts.filter(
          (scheduled) => scheduled.id !== id
        );
      }) as typeof window.clearTimeout);
    performanceNowSpy = jest.spyOn(performance, "now").mockReturnValue(0);
    realConsoleError = console.error.bind(console);
    // The test intentionally leaves generation polling unresolved after the stock
    // prompt timer is registered; suppress only React's background act warning.
    consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation((...args) => {
        if (
          typeof args[0] === "string" &&
          args[0].includes("not wrapped in act")
        ) {
          return;
        }
        realConsoleError(...args);
      });
    window.history.pushState({}, "", "/coordinate");
    window.localStorage.clear();
    window.sessionStorage.clear();

    useTranslationsMock.mockImplementation(() => {
      return ((key: string) => key) as ReturnType<typeof useTranslations>;
    });
    getInProgressJobsMock.mockReturnValue(new Promise<never>(() => undefined));
    fetchPercoinBalanceMock.mockResolvedValue({ balance: 1000 });
    generateImageAsyncMock.mockResolvedValue({
      jobId: "job-1",
      status: "queued",
    });
    pollGenerationStatusMock.mockReturnValue({
      promise: new Promise<never>(() => undefined),
      stop: jest.fn(),
    });
    getPromptPendingMock.mockReturnValue(false);
  });

  afterEach(() => {
    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
    performanceNowSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    jest.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  test("生成送信から3秒後に元画像ストック保存案内を表示する", async () => {
    const view = await startGeneration();

    const timer = getStockPromptTimer();
    expect(showPromptMock).not.toHaveBeenCalled();

    fireScheduledTimeout(timer);

    expect(showPromptMock).toHaveBeenCalledTimes(1);
    expect(showPromptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        file: expect.objectContaining({ name: "source.png" }),
        jobIds: ["job-1"],
      }),
      expect.objectContaining({ onSettled: expect.any(Function) })
    );

    view.unmount();
  });

  test("チュートリアル中は3秒経過後も案内を表示しない", async () => {
    window.sessionStorage.setItem(TUTORIAL_STORAGE_KEYS.IN_PROGRESS, "true");

    const view = await startGeneration();
    const timer = getStockPromptTimer();

    fireScheduledTimeout(timer);

    expect(showPromptMock).not.toHaveBeenCalled();
    view.unmount();
  });

  test("dismiss フラグがある場合は3秒経過後も案内を表示しない", async () => {
    window.localStorage.setItem(
      COORDINATE_STOCK_SAVE_PROMPT_DISMISSED_STORAGE_KEY,
      "true"
    );

    const view = await startGeneration();
    const timer = getStockPromptTimer();

    fireScheduledTimeout(timer);

    expect(showPromptMock).not.toHaveBeenCalled();
    view.unmount();
  });

  test("別 prompt が pending の場合は3秒経過後も案内を表示しない", async () => {
    getPromptPendingMock.mockReturnValue(true);

    const view = await startGeneration();
    const timer = getStockPromptTimer();

    fireScheduledTimeout(timer);

    expect(showPromptMock).not.toHaveBeenCalled();
    view.unmount();
  });

  test("3秒タイマー満了前にアンマウントした場合は案内を表示しない", async () => {
    const view = await startGeneration();

    view.unmount();

    expect(scheduledTimeouts.some((scheduled) => scheduled.delay === 3000)).toBe(
      false
    );

    expect(showPromptMock).not.toHaveBeenCalled();
  });
});
