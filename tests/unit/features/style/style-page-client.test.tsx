import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { StylePageClient } from "@/features/style/components/StylePageClient";
import { SELECTED_MODEL_STORAGE_KEY } from "@/features/generation/lib/form-preferences";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";

jest.mock("next-intl", () => ({
  useLocale: jest.fn(),
  useTranslations: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
  // Phase 4 で追加した useCurrentUrlForRedirect が usePathname / useSearchParams を使う
  usePathname: jest.fn(() => "/style"),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));

const mockRecordStyleUsageClientEvent = jest.fn();

jest.mock("@/features/style/lib/style-usage-client", () => ({
  recordStyleUsageClientEvent: (...args: unknown[]) => {
    mockRecordStyleUsageClientEvent(...args);
    return Promise.resolve();
  },
}));

const mockToast = jest.fn((options?: unknown) => {
  void options;
  return { id: "toast-id" };
});
const mockDismissToast = jest.fn();

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
    dismiss: mockDismissToast,
  }),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: {
    alt?: string;
    className?: string;
    src?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={props.src ?? ""}
      alt={props.alt ?? ""}
      className={props.className}
    />
  ),
}));

jest.mock("@/features/generation/components/ImageUploader", () => ({
  ImageUploader: ({
    addImageLabel,
    compact,
    disabled,
    label,
    onImageRemove,
    onImageUpload,
    aspectRatio,
    filledPreviewMode,
    previewObjectFit,
    value,
  }: {
    addImageLabel?: string;
    compact?: boolean;
    disabled?: boolean;
    label?: string;
    onImageRemove?: () => void;
    onImageUpload: (image: {
      file: File;
      previewUrl: string;
      width: number;
      height: number;
    }) => void;
    aspectRatio?: number;
    filledPreviewMode?: "fixed" | "natural";
    previewObjectFit?: "contain" | "cover";
    value?: { file: File } | null;
  }) => (
    <div
      data-aspect-ratio={aspectRatio ? String(aspectRatio) : undefined}
      data-compact={compact ? "true" : "false"}
      data-disabled={disabled ? "true" : "false"}
      data-filled-preview-mode={filledPreviewMode ?? "fixed"}
      data-preview-object-fit={previewObjectFit ?? "contain"}
    >
      <p>{label}</p>
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          onImageUpload({
            file: new File(["upload-bytes"], "upload.png", {
              type: "image/png",
            }),
            previewUrl: "blob:mock-upload",
            width: 512,
            height: 512,
          })
        }
      >
        {addImageLabel}
      </button>
      {value ? (
        <button type="button" disabled={disabled} onClick={onImageRemove}>
          remove upload
        </button>
      ) : null}
    </div>
  ),
}));

jest.mock("@/features/posts/components/PostModal", () => ({
  PostModal: ({
    open,
    imageId,
  }: {
    open: boolean;
    imageId: string;
  }) =>
    open ? (
      <div data-testid="style-post-modal">post modal for {imageId}</div>
    ) : null,
}));

jest.mock("@/features/generation/lib/normalize-source-image", () => ({
  normalizeSourceImage: async (file: File) => file,
}));

// 画像ソースピッカー一式を mock 化し、選択経路を直接発火できる UI で代替
jest.mock("@/features/generation/components/ImageSourcePickerTrigger", () => ({
  ImageSourcePickerTrigger: ({ onClick }: { onClick: () => void }) => (
    <button type="button" data-testid="mock-picker-trigger" onClick={onClick}>
      open-picker
    </button>
  ),
}));
jest.mock(
  "@/features/generation/components/ImageSourcePicker/ImageSourcePicker",
  () => ({
    ImageSourcePicker: ({
      open,
      onSelectStock,
      onSelectGenerated,
    }: {
      open: boolean;
      onSelectStock: (stock: {
        id: string;
        image_url: string;
        name: string | null;
      }) => void;
      onSelectGenerated: (item: {
        kind: "generated";
        id: string;
        imageUrl: string;
        storagePath: string;
        createdAt: string;
        generationType: string | null;
      }) => void;
    }) =>
      open ? (
        <div data-testid="mock-image-source-picker">
          <button
            type="button"
            onClick={() =>
              onSelectStock({
                id: "stock-A",
                image_url: "https://cdn.example/stock-A.png",
                name: "stock-A",
              })
            }
          >
            mock-select-stock
          </button>
          <button
            type="button"
            onClick={() =>
              onSelectGenerated({
                kind: "generated",
                id: "gen-A",
                imageUrl: "https://cdn.example/gen-A.png",
                storagePath: "u/gen-A.png",
                createdAt: "2026-01-01",
                generationType: "coordinate",
              })
            }
          >
            mock-select-generated
          </button>
        </div>
      ) : null,
  }),
);

const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;
const useLocaleMock = useLocale as jest.MockedFunction<typeof useLocale>;
const useRouterMock = useRouter as jest.MockedFunction<typeof useRouter>;
const translationFunctionCache = new Map<
  string | undefined,
  ReturnType<typeof useTranslations>
>();

const styleMessages = {
  sectionTitle: "Choose a Style",
  sectionDescription: "Select the style you want to try on.",
  characterSectionTitle: "Choose My Character",
  characterSectionDescription: "Upload the character image you want to restyle.",
  styleLabel: "Style",
  uploadLabel: "My Character",
  addImageAction: "Add image",
  styleImageAlt: "Selected style image",
  styleCardAlt: "{name} style card",
  sourceImageTypeLabel: "Upload image type",
  sourceImageTypeIllustration: "Illustration",
  sourceImageTypeReal: "Photo",
  backgroundChangeLabel: "Background",
  backgroundChangeCheckbox: "Change the background to match the style too",
  backgroundChangeDescription:
    "When OFF, the original background is preserved as much as possible. When ON, this preset's background direction is applied as well.",
  backgroundChangeDisabledHint:
    "This style does not support background changes.",
  expandReferenceCardAria: "Restore the reference card to full size",
  collapseReferenceCardAria: "Collapse the reference card",
  expandReferenceCardTitle: "Restore",
  collapseReferenceCardTitle: "Collapse",
  modelLabel: "Generation model",
  modelFixedOption: "Nano Banana 2 / 0.5K",
  generateButton: "Start Styling",
  generatingButton: "Generating...",
  generationStatusTitle: "Styling in progress",
  generationStatusHint: "Checking out the new look.",
  generationStatusSlowHint:
    "It looks like the outfit change is taking a little longer than usual. Please stay with us.",
  generationStatusMessage1: "Admiring this lovely outfit...",
  generationStatusMessage2: "Carefully fitting the selected style...",
  generationStatusMessage3: "Adjusting it to the perfect size...",
  generationStatusMessage4: "Fine-tuning the overall balance...",
  generationStatusMessage5: "Doing one last mirror check!",
  generationStatusMessage6: "The outfit change is almost complete...",
  generationStatusMessage7: "Checking how well it suits you...",
  generationStatusMessage8: "Polishing the finer details...",
  generationStatusMessage9:
    "Adjusting the silhouette so it looks just right...",
  generationStatusMessage10: "This is going to turn out beautifully...",
  generationStatusMessage11: "Carefully reviewing the final look...",
  generationStatusMessage12:
    "It looked a little too big, so we are switching to a smaller size...",
  generationStatusCompleteTitle: "Styling is complete.",
  generationStatusCompleteMessage: "The reveal is coming up in a moment!",
  generationStatusCompleteHint: "",
  resultReadyToastTitle: "The outfit change is ready! Want to check it out?",
  resultsTitle: "Results",
  resultImageAlt: "Generated result",
  resultPlaceholder: "Your generated image will appear here.",
  downloadAriaLabel: "Download generated result",
  downloadAction: "Download",
  downloadSuccessTitle: "Downloaded",
  downloadSuccessDescription: "The image was saved.",
  downloadFailed: "Failed to download the image. Please try again.",
  resultResetConfirmTitle: "This will clear the current result",
  resultResetConfirmDescription:
    "Changing the style, your character image, or the upload image type will remove the generated result. Do you want to continue?",
  resultResetConfirmCancel: "Keep result",
  resultResetConfirmAction: "Continue",
  resultResetConfirmTitleAuthenticated:
    "This will switch the result shown on this screen",
  resultResetConfirmDescriptionAuthenticated:
    "The result shown here will change, but saved images remain available from My Page. Do you want to continue?",
  resultResetConfirmActionAuthenticated: "Continue",
  resultReplaceConfirmTitle: "This will replace the current result",
  resultReplaceConfirmDescription:
    "Running Start Styling again will replace the generated result with a new image. Do you want to continue?",
  resultReplaceConfirmAction: "Generate again",
  resultReplaceConfirmTitleAuthenticated:
    "This will replace the result shown on this screen",
  resultReplaceConfirmDescriptionAuthenticated:
    "The result shown here will be replaced with a new image. Saved images remain available from My Page. Do you want to continue?",
  resultReplaceConfirmActionAuthenticated: "Generate again",
  generationFailed: "Failed to generate the image.",
  guestRateLimitDaily:
    "You have reached today's trial limit (1 per day). Sign up to continue.",
  authenticatedRateLimitDaily:
    "You have reached today's free generation limit.",
  authenticatedPaidContinueHint:
    "You can keep generating for {cost} Percoins per image.",
  authenticatedPaidInsufficientBalance:
    "Your balance is too low. Prepare at least {cost} Percoins to continue.",
  guestRateLimitSignupHint: "Create an account to keep going right away.",
  guestRateLimitSignupAction: "Sign up to continue",
  guestCategoryLoginAction: "Log in to generate!",
  guestCategoryLoginHint: "Log in to generate with every style!",
  percoinBalanceLabel: "Current Percoin balance",
  percoinBalanceLoading: "Checking your Percoin balance...",
  percoinBalanceUnavailable: "We could not load your balance.",
  percoinBalanceValue: "{balance} Percoins",
  percoinBalanceFetchFailed:
    "We could not retrieve your Percoin balance. Please try again in a little while.",
  percoinPurchaseAction: "Buy Percoins",
  remainingDailyNotice: "You have {count} generations left for today.",
  rateLimitDialogTitle: "Traffic is high right now",
  rateLimitDialogClose: "Close",
  unknownError: "An unknown error occurred.",
};

const coordinateMessages = {
  generationStagePreparingMessage1: "Checking the outfit...",
  generationStagePreparingHint1: "Checking the source image and prompt.",
  generationStageQueuedMessage1: "Getting your turn for the outfit change ready...",
  generationStageQueuedHint1: "We're lining this request up for processing.",
  generationStageGeneratingMessage1: "Heading into the fitting room!...",
  generationStageGeneratingHint1:
    "The AI is working through the outfit change.",
  generationStageCompletedMessage1: "The outfit change is ready!",
  generationStageCompletedHint1: "The final check is done.",
};

const postsMessages = {
  postSubmit: "Post",
  postModalTitle: "Post image",
  postModalDescription: "Write a caption if you want.",
  captionLabel: "Caption",
  captionPlaceholder: "Add a caption",
  charactersRemaining: "{count} characters left",
  cancel: "Cancel",
  postSubmitting: "Posting...",
};

const commonMessages = {
  generationCostSuffix: "(cost: {amount} Percoins)",
};

function interpolate(
  template: string,
  values?: Record<string, string | number>
): string {
  if (!values) {
    return template;
  }
  return Object.entries(values).reduce((message, [token, value]) => {
    return message.replace(`{${token}}`, String(value));
  }, template);
}

function translate(
  namespace: string | undefined,
  key: string,
  values?: Record<string, string | number>
): string {
  if (namespace === "coordinate") {
    return coordinateMessages[key as keyof typeof coordinateMessages] ?? key;
  }

  if (namespace === "posts") {
    return interpolate(
      postsMessages[key as keyof typeof postsMessages] ?? key,
      values
    );
  }

  if (namespace === "common") {
    return interpolate(
      commonMessages[key as keyof typeof commonMessages] ?? key,
      values
    );
  }

  if (namespace !== "style") {
    return key;
  }

  return interpolate(
    styleMessages[key as keyof typeof styleMessages] ?? key,
    values
  );
}

const TEST_COORDINATE_CATEGORY = {
  id: "cat-coordinate",
  key: "coordinate",
  displayNameJa: "コーディネート",
  displayNameEn: "Coordinate",
  badgeColor: "#1f2937",
  badgeTextColor: "#ffffff",
  skipBasePrefix: false,
  outputAspectRatioMode: "source",
  userGuidanceJa: null,
  userGuidanceEn: null,
  showSourceImageTypeControl: true,
  showBackgroundChangeControl: true,
  showGenerationModelControl: true,
  showUserPromptInput: false,
  userPromptLabel: null,
  userPromptPlaceholder: null,
  userPromptMaxLength: null,
  visibility: "public",
  isActive: true,
} as const;

const presets: readonly StylePresetPublicSummary[] = [
  {
    id: "c3f48c0b-54d2-4c4d-a18c-bd358b58d3b1",
    title: "PARIS CODE",
    thumbnailImageUrl: "https://example.com/style-presets/paris-code.webp",
    thumbnailWidth: 912,
    thumbnailHeight: 1173,
    hasBackgroundPrompt: true,
    category: TEST_COORDINATE_CATEGORY,
    imageInputMode: "single",
    dualReferenceSource: "admin",
  },
  {
    id: "a4d8859c-c8ab-4b53-9b97-d9b0e6970a2e",
    title: "FLUFFY PAJAMAS CODE LONG TITLE",
    thumbnailImageUrl: "https://example.com/style-presets/fluffy-pajamas-code.webp",
    thumbnailWidth: 640,
    thumbnailHeight: 480,
    hasBackgroundPrompt: false,
    category: TEST_COORDINATE_CATEGORY,
    imageInputMode: "single",
    dualReferenceSource: "admin",
  },
];

describe("StylePageClient", () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;
  let originalFetch: typeof global.fetch;
  let routerPushMock: jest.Mock;
  let statusPayloadQueue: Array<{
    authState: "authenticated" | "guest";
    remainingDaily: number | null;
    showRemainingWarning: boolean;
  }>;
  let percoinBalanceQueue: Array<{ balance: number }>;
  let generateResponseQueue: Array<Response | Promise<Response>>;
  let asyncGenerateResponseQueue: Array<Response | Promise<Response>>;
  let generationStatusResponseQueue: Array<Response | Promise<Response>>;
  let scrollIntoViewMock: jest.Mock;

  const createJsonResponse = (body: Record<string, unknown>, ok = true) =>
    ({
      ok,
      json: async () => body,
    } as Response);

  const createBlobResponse = (
    imageUrl: string,
    mimeType = "image/png"
  ) =>
    ({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "content-type" ? mimeType : null,
      },
      blob: async () => new Blob(["image-bytes"], { type: mimeType }),
      url: imageUrl,
    } as Response);

  // React 19 uses setTimeout(fn, 0) for scheduling in jsdom (no MessageChannel).
  // advanceTimersByTime(0) won't trigger nested setTimeout(0) calls scheduled
  // during execution, so we advance by 1ms to let React's scheduler fully flush.
  const flushReactScheduler = async () => {
    for (let i = 0; i < 10; i += 1) {
      jest.advanceTimersByTime(1);
      await Promise.resolve();
    }
  };

  const uploadImageAndWaitUntilReady = async () => {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add image" }));
      await flushReactScheduler();
    });
    expect(
      screen.getByRole("button", { name: /Start Styling/ })
    ).toBeEnabled();
  };

  const hasStyleGenerateRequest = () => {
    return fetchMock.mock.calls.some(([input, init]) => {
      const requestUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      return requestUrl === "/style/generate" && (init?.method ?? "GET") === "POST";
    });
  };

  const startStylingAndWaitForRequest = async () => {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Start Styling/ }));
      await flushReactScheduler();
    });
    expect(hasStyleGenerateRequest()).toBe(true);
  };

  beforeEach(() => {
    mockToast.mockImplementation(() => ({ id: "toast-id" }));
    mockDismissToast.mockReset();
    routerPushMock = jest.fn();
    useRouterMock.mockReturnValue({
      push: routerPushMock,
      refresh: jest.fn(),
    } as unknown as ReturnType<typeof useRouter>);
    useLocaleMock.mockReturnValue("en");

    translationFunctionCache.clear();
    useTranslationsMock.mockImplementation((namespace?: string) => {
      const cached = translationFunctionCache.get(namespace);
      if (cached) {
        return cached;
      }

      const nextTranslationFn = ((key: string, values?: Record<string, string | number>) =>
        translate(namespace, key, values)) as ReturnType<typeof useTranslations>;
      translationFunctionCache.set(namespace, nextTranslationFn);
      return nextTranslationFn;
    });

    originalFetch = global.fetch;
    statusPayloadQueue = [];
    percoinBalanceQueue = [{ balance: 120 }];
    generateResponseQueue = [
      createJsonResponse({
        imageDataUrl: "data:image/png;base64,generated-image-base64",
        mimeType: "image/png",
      }),
    ];
    asyncGenerateResponseQueue = [
      createJsonResponse({
        jobId: "style-job-001",
        status: "queued",
      }),
    ];
    generationStatusResponseQueue = [
      createJsonResponse({
        id: "style-job-001",
        status: "processing",
        processingStage: "generating",
        resultImageUrl: null,
        previewImageUrl: null,
        errorMessage: null,
        generatedImageId: null,
      }),
      createJsonResponse({
        id: "style-job-001",
        status: "succeeded",
        processingStage: "completed",
        resultImageUrl: "https://cdn.example.com/generated-style-result.png",
        previewImageUrl: null,
        errorMessage: null,
        generatedImageId: "generated-image-001",
      }),
    ];
    scrollIntoViewMock = jest.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewMock,
    });
    // jsdom には URL.revokeObjectURL が無いため polyfill。
    // StylePageClient が blob URL の cleanup でこれを呼ぶ。
    if (typeof URL.revokeObjectURL !== "function") {
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: jest.fn(),
      });
    }
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: "Desktop",
    });
    Object.defineProperty(window.navigator, "canShare", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window.navigator, "share", {
      configurable: true,
      value: undefined,
    });
    fetchMock = jest.fn().mockImplementation((input, init) => {
      const requestUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const method = init?.method ?? "GET";

      if (requestUrl === "/style/rate-limit-status" && method === "GET") {
        const nextPayload = statusPayloadQueue.shift();
        if (!nextPayload) {
          return new Promise<Response>(() => {});
        }
        return Promise.resolve(createJsonResponse(nextPayload));
      }

      if (requestUrl === "/api/credits/balance" && method === "GET") {
        const nextPayload = percoinBalanceQueue.shift() ?? { balance: 120 };
        return Promise.resolve(createJsonResponse(nextPayload));
      }

      if (requestUrl === "/style/generate" && method === "POST") {
        const nextResponse =
          generateResponseQueue.shift() ??
          createJsonResponse({
            imageDataUrl: "data:image/png;base64,generated-image-base64",
            mimeType: "image/png",
          });
        return Promise.resolve(nextResponse);
      }

      if (requestUrl === "/style/generate-async" && method === "POST") {
        const nextResponse =
          asyncGenerateResponseQueue.shift() ??
          createJsonResponse({
            jobId: "style-job-001",
            status: "queued",
          });
        return Promise.resolve(nextResponse);
      }

      if (
        requestUrl.startsWith("/api/generation-status?") &&
        method === "GET"
      ) {
        const nextResponse =
          generationStatusResponseQueue.shift() ??
          createJsonResponse({
            id: "style-job-001",
            status: "succeeded",
            processingStage: "completed",
            resultImageUrl: "https://cdn.example.com/generated-style-result.png",
            previewImageUrl: null,
            errorMessage: null,
            generatedImageId: "generated-image-001",
          });
        return Promise.resolve(nextResponse);
      }

      if (
        requestUrl.startsWith("data:image/") ||
        requestUrl === "https://cdn.example.com/generated-style-result.png"
      ) {
        return Promise.resolve(createBlobResponse(requestUrl));
      }

      return Promise.resolve(createJsonResponse({}));
    }) as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.useRealTimers();
    window.localStorage.clear();
    global.fetch = originalFetch;
    mockToast.mockReset();
    mockDismissToast.mockReset();
    mockRecordStyleUsageClientEvent.mockReset();
    jest.restoreAllMocks();
  });

  test("初期表示で先頭スタイルが選択済みでスタイル画像に反映される", () => {
    render(<StylePageClient presets={presets} />);

    expect(screen.getByText("Select the style you want to try on.")).toBeInTheDocument();
    expect(screen.getByText("Choose My Character")).toBeInTheDocument();
    expect(
      screen.getByText("Upload the character image you want to restyle.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /PARIS CODE style card/ })
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByAltText("Selected style image")).toHaveAttribute(
      "src",
      "https://example.com/style-presets/paris-code.webp"
    );
    expect(mockRecordStyleUsageClientEvent).toHaveBeenCalledWith({
      eventType: "visit",
      styleId: null,
    });
  });

  test("英語localeではカテゴリバッジに英語名を表示する", () => {
    const chibiPresets: readonly StylePresetPublicSummary[] = [
      {
        ...presets[0],
        id: "preset-chibi",
        title: "CHIBI STYLE",
        category: {
          ...TEST_COORDINATE_CATEGORY,
          key: "chibi",
          displayNameJa: "ちびキャラ",
          displayNameEn: "Chibi",
        },
      },
    ];

    render(<StylePageClient presets={chibiPresets} />);

    expect(screen.getByText("Chibi")).toBeInTheDocument();
    expect(screen.queryByText("ちびキャラ")).not.toBeInTheDocument();
  });

  test("初期選択プリセットIDが指定された場合はそのカードを選択状態で表示する", () => {
    render(
      <StylePageClient
        presets={presets}
        initialSelectedPresetId="a4d8859c-c8ab-4b53-9b97-d9b0e6970a2e"
      />
    );

    expect(
      screen.getByRole("button", {
        name: /FLUFFY PAJAMAS CODE LONG TITLE style card/i,
      })
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByAltText("Selected style image")).toHaveAttribute(
      "src",
      "https://example.com/style-presets/fluffy-pajamas-code.webp"
    );
  });

  test("詳細画面からの初期選択後でも別スタイルへ切り替えられる", () => {
    render(
      <StylePageClient
        presets={presets}
        initialSelectedPresetId="a4d8859c-c8ab-4b53-9b97-d9b0e6970a2e"
      />
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /PARIS CODE style card/i,
      })
    );

    expect(
      screen.getByRole("button", { name: /PARIS CODE style card/i })
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", {
        name: /FLUFFY PAJAMAS CODE LONG TITLE style card/i,
      })
    ).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByAltText("Selected style image")).toHaveAttribute(
      "src",
      "https://example.com/style-presets/paris-code.webp"
    );
  });

  test("詳細画面から選択付きで遷移した場合は選択カードまで自動スクロールする", () => {
    render(
      <StylePageClient
        presets={presets}
        initialSelectedPresetId="a4d8859c-c8ab-4b53-9b97-d9b0e6970a2e"
      />
    );

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  });

  test("スタイル画像URLをそのまま参照する", () => {
    render(<StylePageClient presets={presets} />);

    expect(screen.getByAltText("PARIS CODE style card")).toHaveAttribute(
      "src",
      "https://example.com/style-presets/paris-code.webp"
    );
  });

  test("スタイルカードの長いタイトルは16文字で省略表示される", () => {
    render(<StylePageClient presets={presets} />);

    expect(screen.getByText("FLUFFY PAJAMAS C...")).toBeInTheDocument();
  });

  test("スタイルカード画像は上揃えで表示する", () => {
    render(<StylePageClient presets={presets} />);

    expect(screen.getByAltText("PARIS CODE style card")).toHaveClass("object-top");
  });

  test("PCではスタイル一覧を左右ドラッグして横スクロールできる", () => {
    render(<StylePageClient presets={presets} />);

    const strip = screen.getByTestId("style-preset-strip");
    Object.defineProperty(strip, "scrollLeft", {
      value: 0,
      writable: true,
    });

    fireEvent.mouseDown(strip, {
      clientX: 100,
      button: 0,
    });
    fireEvent.mouseMove(window, {
      pointerType: "mouse",
      clientX: 40,
    });

    expect(strip.scrollLeft).toBe(60);

    fireEvent.mouseUp(window, {
      clientX: 40,
    });
  });

  test("アップロード前はコーデスタートが押せず_アップロード後に有効化される", () => {
    render(<StylePageClient presets={presets} />);

    const generateButton = screen.getByRole("button", {
      name: /Start Styling/,
    });
    expect(generateButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Add image" }));

    expect(generateButton).toBeEnabled();
  });

  test("背景変更対応presetではチェックボックスが有効で送信時にbackgroundChange=falseを含む", async () => {
    jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });

    render(<StylePageClient presets={presets} />);

    const checkbox = screen.getByRole("checkbox", {
      name: "Change the background to match the style too",
    });
    expect(checkbox).toBeEnabled();
    expect(
      screen.getByText(
        "When OFF, the original background is preserved as much as possible. When ON, this preset's background direction is applied as well."
      )
    ).toBeInTheDocument();

    await uploadImageAndWaitUntilReady();

    await startStylingAndWaitForRequest();

    const generateCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        (typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url) === "/style/generate" &&
        (init?.method ?? "GET") === "POST"
    );
    expect(generateCall).toBeDefined();
    const [, init] = generateCall!;
    const formData = init?.body as FormData;
    expect(formData.get("backgroundChange")).toBe("false");
  });

  test("ゲストでlocalStorageに許可外モデルが残っていてもstyle sync送信では既定モデルに丸める", async () => {
    jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });
    window.localStorage.setItem(
      SELECTED_MODEL_STORAGE_KEY,
      "gemini-3-pro-image-4k"
    );

    render(<StylePageClient presets={presets} />);

    await uploadImageAndWaitUntilReady();
    await startStylingAndWaitForRequest();

    const generateCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        (typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url) ===
          "/style/generate" && (init?.method ?? "GET") === "POST"
    );
    expect(generateCall).toBeDefined();
    const [, init] = generateCall!;
    const formData = init?.body as FormData;

    expect(formData.get("model")).toBe("gpt-image-2-low-1k");
    expect(window.localStorage.getItem(SELECTED_MODEL_STORAGE_KEY)).toBe(
      "gemini-3-pro-image-4k"
    );
  });

  test("カテゴリ設定でフォーム項目を非表示にし_既定値で送信する", async () => {
    jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });
    window.localStorage.setItem(
      SELECTED_MODEL_STORAGE_KEY,
      "gemini-3-pro-image-4k"
    );
    const hiddenControlPresets: readonly StylePresetPublicSummary[] = [
      {
        ...presets[0],
        category: {
          ...TEST_COORDINATE_CATEGORY,
          showSourceImageTypeControl: false,
          showBackgroundChangeControl: false,
          showGenerationModelControl: false,
        },
      },
    ];

    render(<StylePageClient presets={hiddenControlPresets} />);

    expect(screen.queryByText("Upload image type")).not.toBeInTheDocument();
    expect(screen.queryByText("Background")).not.toBeInTheDocument();
    expect(screen.queryByText("Generation model")).not.toBeInTheDocument();

    await uploadImageAndWaitUntilReady();
    await startStylingAndWaitForRequest();

    const generateCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        (typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url) ===
          "/style/generate" && (init?.method ?? "GET") === "POST"
    );
    expect(generateCall).toBeDefined();
    const [, init] = generateCall!;
    const formData = init?.body as FormData;

    expect(formData.get("sourceImageType")).toBe("illustration");
    expect(formData.get("backgroundChange")).toBe("false");
    expect(formData.get("model")).toBe("gpt-image-2-low-1k");
  });

  test("背景変更非対応presetではチェックボックスをdisabledにし、選択切替時にOFFへ戻す", () => {
    render(<StylePageClient presets={presets} />);

    const checkbox = screen.getByRole("checkbox", {
      name: "Change the background to match the style too",
    });
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    fireEvent.click(
      screen.getByRole("button", { name: /FLUFFY PAJAMAS CODE LONG TITLE style card/i })
    );

    expect(checkbox).toBeDisabled();
    expect(checkbox).not.toBeChecked();
    expect(
      screen.getByText("This style does not support background changes.")
    ).toBeInTheDocument();
  });

  test("入力エリアはUploadがStyleより前に表示される", () => {
    render(<StylePageClient presets={presets} />);

    const uploadLabel = screen.getByText("My Character");
    const styleLabel = screen.getByText("Style");

    expect(
      uploadLabel.compareDocumentPosition(styleLabel) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  test("参照カードは縮小と復元を切り替えられる", () => {
    render(<StylePageClient presets={presets} />);

    const referenceCard = screen.getByTestId("style-reference-card");
    const collapseButton = screen.getByRole("button", {
      name: "Collapse the reference card",
    });

    expect(referenceCard.className).not.toContain("sticky");
    expect(referenceCard.className).toContain("w-full");
    fireEvent.click(collapseButton);

    expect(referenceCard.className).toContain("w-[50%]");
    expect(
      screen.getByRole("button", {
        name: "Restore the reference card to full size",
      })
    ).toBeInTheDocument();
    expect(screen.getByText("My Character").parentElement).toHaveAttribute(
      "data-aspect-ratio",
      String(912 / 1173)
    );
  });

  test("スタイルの比率に合わせてアップロード側の比率も切り替わる", () => {
    render(<StylePageClient presets={presets} />);

    fireEvent.click(
      screen.getByRole("button", { name: /FLUFFY PAJAMAS CODE LONG TITLE style card/i })
    );

    expect(screen.getByText("My Character").parentElement).toHaveAttribute(
      "data-aspect-ratio",
      String(640 / 480)
    );
  });

  test("My Characterプレビューは自然なアスペクト比で表示する", () => {
    render(<StylePageClient presets={presets} />);

    expect(screen.getByText("My Character").parentElement).toHaveAttribute(
      "data-filled-preview-mode",
      "natural"
    );
  });

  test("生成中はスタイル選択とアップロード削除を操作できない", async () => {
    jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });

    let resolveFetch: ((value: Response) => void) | null = null;
    generateResponseQueue = [
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    ];

    render(<StylePageClient presets={presets} />);

    await uploadImageAndWaitUntilReady();
    await startStylingAndWaitForRequest();

    expect(screen.getByRole("button", { name: "Generating..." })).toBeDisabled();
    expect(
      screen.getByText("Styling in progress")
    ).toBeInTheDocument();
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
    expect(
      screen.getByText("Checking out the new look.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /PARIS CODE style card/ })
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "remove upload" })).toBeDisabled();
    expect(screen.getByText("My Character").parentElement).toHaveAttribute(
      "data-disabled",
      "true"
    );

    await act(async () => {
      resolveFetch?.({
        ok: true,
        json: async () => ({
          imageDataUrl: "data:image/png;base64,generated-image-base64",
          mimeType: "image/png",
        }),
      } as Response);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      await screen.findByText("Styling is complete.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generating..." })).toBeDisabled();

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    // ゲストは1枚生成後、結果消失と上限エラーを防ぐため再生成ボタンは無効のまま。
    expect(screen.getByRole("button", { name: /Start Styling/ })).toBeDisabled();
  });

  test("reduced motion が有効な場合は生成ステータスへのスクロールを即時にする", async () => {
    jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

    generateResponseQueue = [new Promise<Response>(() => {})];

    render(<StylePageClient presets={presets} />);

    await uploadImageAndWaitUntilReady();
    await startStylingAndWaitForRequest();

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: "auto",
      block: "center",
    });
  });

  test("生成完了の2秒後に完了トーストを表示し_選択時に結果エリアへ移動する", async () => {
    jest.useFakeTimers();

    render(<StylePageClient presets={presets} />);

    fireEvent.click(screen.getByRole("button", { name: "Add image" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Start Styling/ }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await screen.findByText("Styling is complete.");
    scrollIntoViewMock.mockClear();
    mockToast.mockClear();

    act(() => {
      jest.advanceTimersByTime(1999);
    });

    expect(scrollIntoViewMock).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "The outfit change is ready! Want to check it out?",
        onClick: expect.any(Function),
      })
    );
    expect(scrollIntoViewMock).not.toHaveBeenCalled();

    const latestToast = mockToast.mock.calls.at(-1)?.[0] as
      | { onClick?: () => void }
      | undefined;

    act(() => {
      latestToast?.onClick?.();
    });

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
    expect(mockDismissToast).toHaveBeenCalledWith("toast-id");
  });

  test("結果画像の読み込み完了後に結果エリアを再度中央へスクロールする", async () => {
    jest.useFakeTimers();

    render(<StylePageClient presets={presets} />);

    fireEvent.click(screen.getByRole("button", { name: "Add image" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Start Styling/ }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await screen.findByText("Styling is complete.");
    scrollIntoViewMock.mockClear();
    mockToast.mockClear();

    act(() => {
      jest.advanceTimersByTime(1999);
    });

    expect(scrollIntoViewMock).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });

    const latestToast = mockToast.mock.calls.at(-1)?.[0] as
      | { onClick?: () => void }
      | undefined;

    act(() => {
      latestToast?.onClick?.();
    });

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });

    scrollIntoViewMock.mockClear();

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    const resultImage = await screen.findByAltText("Generated result");
    Object.defineProperty(resultImage, "naturalWidth", {
      configurable: true,
      value: 1024,
    });
    Object.defineProperty(resultImage, "naturalHeight", {
      configurable: true,
      value: 768,
    });

    fireEvent.load(resultImage);
    act(() => {
      jest.runOnlyPendingTimers();
    });

    await waitFor(() => {
      expect(screen.getByTestId("generation-result-shell").style.aspectRatio).toBe(
        String(1024 / 768)
      );
    });

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
  });

  test("生成が長引くとフォールバック文言に切り替わる", async () => {
    jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });

    generateResponseQueue = [new Promise<Response>(() => {})];

    render(<StylePageClient presets={presets} />);

    await uploadImageAndWaitUntilReady();
    await startStylingAndWaitForRequest();

    expect(
      screen.getByText("Checking out the new look.")
    ).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(21000);
    });

    expect(
      screen.getByText(
        "It looks like the outfit change is taking a little longer than usual. Please stay with us."
      )
    ).toBeInTheDocument();
  });

  test("生成成功時にFormDataを送信し_単一結果を表示する", async () => {
    jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });

    render(<StylePageClient presets={presets} />);

    await uploadImageAndWaitUntilReady();

    await startStylingAndWaitForRequest();

    expect(fetchMock).toHaveBeenCalled();

    expect(
      await screen.findByText("Styling is complete.")
    ).toBeInTheDocument();
    expect(
      await screen.findByText("The reveal is coming up in a moment!")
    ).toBeInTheDocument();
    expect(await screen.findByAltText("Generated result")).toHaveAttribute(
      "src",
      "data:image/png;base64,generated-image-base64"
    );

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(await screen.findByAltText("Generated result")).toHaveAttribute(
      "src",
      "data:image/png;base64,generated-image-base64"
    );
    expect(screen.getByTestId("generation-result-card")).toHaveClass(
      "max-w-[340px]",
      "sm:max-w-[420px]"
    );
    expect(screen.getByTestId("generation-result-card")).not.toHaveClass(
      "mx-auto"
    );
    expect(
      screen.getByRole("button", { name: "Download generated result" })
    ).toBeInTheDocument();
    expect(screen.getByText("Download")).toBeInTheDocument();
    expect(screen.getByTestId("style-reference-card").className).not.toContain(
      "sticky"
    );
  });

  test("ログインユーザーは非同期ジョブの進捗を使って/style生成を表示する", async () => {
    jest.useFakeTimers();
    jest.spyOn(Math, "random").mockReturnValue(0);

    render(
      <StylePageClient
        presets={presets}
        initialAuthState="authenticated"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Add image" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Start Styling/ }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/style/generate-async",
      expect.objectContaining({
        method: "POST",
      })
    );
    expect(
      screen.getByRole("button", { name: "Generating..." })
    ).toBeDisabled();
    const liveRegion = await screen.findByRole("status");
    expect(liveRegion.textContent).not.toContain("Checking out the new look.");
    expect(liveRegion.textContent ?? "").toMatch(
      /Checking the source image and prompt\.|We're lining this request up for processing\.|The AI is working through the outfit change\.|The outfit change is ready!|The final check is done\.|generationStage/
    );

    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      await screen.findByText("Styling is complete.")
    ).toBeInTheDocument();
    expect(await screen.findByAltText("Generated result")).toHaveAttribute(
      "src",
      "https://cdn.example.com/generated-style-result.png"
    );

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(await screen.findByAltText("Generated result")).toHaveAttribute(
      "src",
      "https://cdn.example.com/generated-style-result.png"
    );
    fireEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(screen.getByTestId("style-post-modal")).toHaveTextContent(
      "generated-image-001"
    );
    expect(mockRecordStyleUsageClientEvent).toHaveBeenCalledWith({
      eventType: "generate",
      styleId: "c3f48c0b-54d2-4c4d-a18c-bd358b58d3b1",
    });
  });

  test("ログインユーザーの/style非同期生成中はpreview画像を先に表示する", async () => {
    jest.useFakeTimers();

    generationStatusResponseQueue = [
      createJsonResponse({
        id: "style-job-001",
        status: "processing",
        processingStage: "persisting",
        resultImageUrl: null,
        previewImageUrl: "https://cdn.example.com/generated-style-preview.png",
        errorMessage: null,
        generatedImageId: null,
      }),
      new Promise<Response>(() => {}),
    ];

    render(
      <StylePageClient
        presets={presets}
        initialAuthState="authenticated"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Add image" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Start Styling/ }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(await screen.findByAltText("Generated result")).toHaveAttribute(
      "src",
      "https://cdn.example.com/generated-style-preview.png"
    );
    expect(screen.queryByRole("button", { name: "Post" })).not.toBeInTheDocument();
  });

  test("スマホでは/styleのダウンロードが共有シートを優先する", async () => {
    jest.useFakeTimers();

    const shareMock = jest.fn().mockResolvedValue(undefined);
    const canShareMock = jest.fn().mockReturnValue(true);

    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: "iPhone",
    });
    Object.defineProperty(window.navigator, "canShare", {
      configurable: true,
      value: canShareMock,
    });
    Object.defineProperty(window.navigator, "share", {
      configurable: true,
      value: shareMock,
    });

    render(<StylePageClient presets={presets} />);

    fireEvent.click(screen.getByRole("button", { name: "Add image" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Start Styling/ }));
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    fireEvent.click(
      await screen.findByRole("button", { name: "Download generated result" })
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(canShareMock).toHaveBeenCalledWith({
      files: expect.any(Array),
    });
    expect(shareMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Persta.AI",
        files: expect.any(Array),
      })
    );
    expect(mockRecordStyleUsageClientEvent).toHaveBeenCalledWith({
      eventType: "download",
      styleId: "c3f48c0b-54d2-4c4d-a18c-bd358b58d3b1",
    });
  });

  test("ゲストは生成結果がある状態では設定変更が無効化され結果が消えない", async () => {
    jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });

    render(<StylePageClient presets={presets} />);

    await uploadImageAndWaitUntilReady();
    await startStylingAndWaitForRequest();
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(await screen.findByAltText("Generated result")).toHaveAttribute(
      "src",
      "data:image/png;base64,generated-image-base64"
    );

    // ゲストは1日1回で再生成できないため、結果を消す設定変更を一括で抑止する。
    expect(
      screen.getByRole("button", {
        name: /FLUFFY PAJAMAS CODE LONG TITLE style card/i,
      })
    ).toBeDisabled();
    const photoRadio = screen.getByRole("radio", { name: "Photo" });
    expect(photoRadio).toBeDisabled();

    // 無効化されているため確認ダイアログも出ず、結果は保持される。
    fireEvent.click(photoRadio);
    expect(
      screen.queryByText("This will clear the current result")
    ).not.toBeInTheDocument();
    expect(screen.getByAltText("Generated result")).toHaveAttribute(
      "src",
      "data:image/png;base64,generated-image-base64"
    );
  });

  test("ログインユーザーは設定変更の確認に同意すると結果を消して変更を反映する", async () => {
    jest.useFakeTimers();

    render(
      <StylePageClient presets={presets} initialAuthState="authenticated" />
    );

    fireEvent.click(screen.getByRole("button", { name: "Add image" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Start Styling/ }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(await screen.findByAltText("Generated result")).toHaveAttribute(
      "src",
      "https://cdn.example.com/generated-style-result.png"
    );

    // 認証ユーザーは結果がアカウントに保存されるため、設定変更の確認に同意すれば
    // 表示結果を切り替えられる(=従来どおりの操作自由度を維持)。
    fireEvent.click(screen.getByRole("radio", { name: "Photo" }));
    expect(
      screen.getByText("This will switch the result shown on this screen")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.queryByAltText("Generated result")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Photo" })).toBeChecked();
  });

  test("ゲストは1枚生成後はStart Stylingが無効化され再生成できない(結果消失と上限エラーを防ぐ)", async () => {
    jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });

    render(<StylePageClient presets={presets} />);

    await uploadImageAndWaitUntilReady();

    await startStylingAndWaitForRequest();

    expect(fetchMock).toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(await screen.findByAltText("Generated result")).toHaveAttribute(
      "src",
      "data:image/png;base64,generated-image-base64"
    );

    // 生成済みゲストは再生成ボタンが無効(押しても確認ダイアログは出ない)。
    const startButton = screen.getByRole("button", { name: /Start Styling/ });
    expect(startButton).toBeDisabled();

    fireEvent.click(startButton);
    expect(
      screen.queryByText("This will replace the current result")
    ).not.toBeInTheDocument();
    // 結果は保持されたまま
    expect(screen.getByAltText("Generated result")).toBeInTheDocument();
  });

  test("ログインユーザーが生成結果ありで設定変更すると保存済み前提の確認文言を表示する", async () => {
    jest.useFakeTimers();

    render(
      <StylePageClient
        presets={presets}
        initialAuthState="authenticated"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Add image" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Start Styling/ }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(await screen.findByAltText("Generated result")).toHaveAttribute(
      "src",
      "https://cdn.example.com/generated-style-result.png"
    );

    fireEvent.click(screen.getByRole("radio", { name: "Photo" }));

    expect(
      screen.getByText("This will switch the result shown on this screen")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The result shown here will change, but saved images remain available from My Page. Do you want to continue?"
      )
    ).toBeInTheDocument();
  });

  test("ログインユーザーが再生成すると保存済み前提の上書き確認文言を表示する", async () => {
    jest.useFakeTimers();

    render(
      <StylePageClient
        presets={presets}
        initialAuthState="authenticated"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Add image" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Start Styling/ }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(await screen.findByAltText("Generated result")).toHaveAttribute(
      "src",
      "https://cdn.example.com/generated-style-result.png"
    );

    fireEvent.click(screen.getByRole("button", { name: /Start Styling/ }));

    expect(
      screen.getByText("This will replace the result shown on this screen")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The result shown here will be replaced with a new image. Saved images remain available from My Page. Do you want to continue?"
      )
    ).toBeInTheDocument();
  });

  test("guest制限エラー時_signup CTAを表示して遷移できる", async () => {
    jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });

    generateResponseQueue = [
      createJsonResponse(
        {
          error:
            "You have reached today's free trial limit. Sign up to keep using One-Tap Style.",
          errorCode: "STYLE_RATE_LIMIT_DAILY",
          signupCta: true,
          signupPath: "/signup?next=%2Fstyle&signup_source=style",
        },
        false
      ),
    ];

    render(<StylePageClient presets={presets} />);

    await uploadImageAndWaitUntilReady();
    await startStylingAndWaitForRequest();

    expect(
      screen.getByText(
        "You have reached today's free trial limit. Sign up to keep using One-Tap Style."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText("Create an account to keep going right away.")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sign up to continue" }));

    expect(mockRecordStyleUsageClientEvent).toHaveBeenCalledWith({
      eventType: "signup_click",
      styleId: presets[0].id,
    });
    expect(routerPushMock).toHaveBeenCalledWith(
      "/signup?next=%2Fstyle&signup_source=style"
    );
  });

  test("短時間制限エラー時_ダイアログを表示する", async () => {
    jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });

    generateResponseQueue = [
      createJsonResponse(
        {
          error: "Servers are busy right now. Please try again in a moment.",
          errorCode: "STYLE_RATE_LIMIT_SHORT",
          showRateLimitDialog: true,
        },
        false
      ),
    ];

    render(<StylePageClient presets={presets} />);

    await uploadImageAndWaitUntilReady();
    await startStylingAndWaitForRequest();

    expect(screen.getByText("Traffic is high right now")).toBeInTheDocument();
    expect(
      screen.getByText("Servers are busy right now. Please try again in a moment.")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(
      screen.queryByText("Servers are busy right now. Please try again in a moment.")
    ).not.toBeInTheDocument();
  });

  test("認証済みユーザーの残り生成回数が2回の時_注意表示を出す", async () => {
    statusPayloadQueue = [
      {
        authState: "authenticated",
        remainingDaily: 2,
        showRemainingWarning: true,
      },
    ];

    render(<StylePageClient presets={presets} />);

    expect(
      await screen.findByText("You have 2 generations left for today.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Guest users can try generation/)
    ).not.toBeInTheDocument();
  });

  test("未ログインユーザーも残り2回以下になるとカウントダウンを表示する", async () => {
    statusPayloadQueue = [
      {
        authState: "guest",
        remainingDaily: 2,
        showRemainingWarning: true,
      },
      {
        authState: "guest",
        remainingDaily: 1,
        showRemainingWarning: true,
      },
    ];

    render(<StylePageClient presets={presets} />);

    expect(
      await screen.findByText("You have 2 generations left for today.")
    ).toBeInTheDocument();

    await uploadImageAndWaitUntilReady();
    fireEvent.click(screen.getByRole("button", { name: /Start Styling/ }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      screen.queryByText(/Guest users can try generation/)
    ).not.toBeInTheDocument();
    expect(
      await screen.findByText("You have 1 generations left for today.")
    ).toBeInTheDocument();
  });

  test("未ログインユーザーが上限到達時_上限メッセージのみ表示し生成を止める(ボタンは出さない)", async () => {
    statusPayloadQueue = [
      {
        authState: "guest",
        remainingDaily: 0,
        showRemainingWarning: true,
      },
    ];

    render(<StylePageClient presets={presets} />);

    // coordinate と同じ一行の上限メッセージのみ表示する。
    expect(
      await screen.findByText(
        "You have reached today's trial limit (1 per day). Sign up to continue."
      )
    ).toBeInTheDocument();
    // 補助文と「新規登録して続ける」ボタンは出さない。
    expect(
      screen.queryByText("Create an account to keep going right away.")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sign up to continue" })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add image" }));

    expect(
      screen.getByRole("button", { name: /Start Styling/ })
    ).toBeDisabled();
  });

  test("未ログインユーザーがcoordinate以外のカテゴリ選択時_生成ボタンの代わりにログインCTAを出す", async () => {
    const chibiCategory = {
      ...TEST_COORDINATE_CATEGORY,
      id: "cat-chibi",
      key: "chibi",
      displayNameJa: "ちびキャラ",
      displayNameEn: "Chibi",
    } as const;
    const chibiPreset: StylePresetPublicSummary = {
      ...presets[0],
      id: "chibi-preset-1",
      category: chibiCategory,
    };

    render(
      <StylePageClient presets={[chibiPreset]} initialAuthState="guest" />
    );

    expect(
      await screen.findByRole("button", { name: "Log in to generate!" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Log in to generate with every style!")
    ).toBeInTheDocument();
    // 生成ボタンは描画しない
    expect(
      screen.queryByRole("button", { name: /Start Styling/ })
    ).not.toBeInTheDocument();
  });

  test("未ログインユーザーがcoordinateカテゴリ選択時_生成ボタンを出しログインCTAは出さない", async () => {
    render(<StylePageClient presets={presets} initialAuthState="guest" />);

    expect(
      await screen.findByRole("button", { name: /Start Styling/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Log in to generate!" })
    ).not.toBeInTheDocument();
  });

  test("ログインユーザーはcoordinate以外のカテゴリでも生成ボタンを出す", async () => {
    const chibiCategory = {
      ...TEST_COORDINATE_CATEGORY,
      id: "cat-chibi",
      key: "chibi",
      displayNameJa: "ちびキャラ",
      displayNameEn: "Chibi",
    } as const;
    const chibiPreset: StylePresetPublicSummary = {
      ...presets[0],
      id: "chibi-preset-2",
      category: chibiCategory,
    };

    render(
      <StylePageClient presets={[chibiPreset]} initialAuthState="authenticated" />
    );

    expect(
      await screen.findByRole("button", { name: /Start Styling/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Log in to generate!" })
    ).not.toBeInTheDocument();
  });

  test("ログインユーザーが上限到達時_翌日案内カードを表示して生成を止める", async () => {
    statusPayloadQueue = [
      {
        authState: "authenticated",
        remainingDaily: 0,
        showRemainingWarning: true,
      },
    ];
    percoinBalanceQueue = [{ balance: 25 }, { balance: 25 }];

    render(<StylePageClient presets={presets} />);

    expect(
      await screen.findByText(
        "You have reached today's free generation limit."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText("You can keep generating for 10 Percoins per image.")
    ).toBeInTheDocument();
    expect(screen.getByText("25 Percoins")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sign up to continue" })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add image" }));

    expect(
      screen.getByRole("button", { name: /Start Styling.*cost: 10 Percoins/ })
    ).toBeEnabled();
  });

  test("ログインユーザーが無料上限到達かつ残高不足の時_購入導線を表示してボタンを無効化する", async () => {
    statusPayloadQueue = [
      {
        authState: "authenticated",
        remainingDaily: 0,
        showRemainingWarning: true,
      },
    ];
    percoinBalanceQueue = [{ balance: 5 }, { balance: 5 }];

    render(<StylePageClient presets={presets} />);

    expect(
      await screen.findByText(
        "You have reached today's free generation limit."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your balance is too low. Prepare at least 10 Percoins to continue."
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add image" }));

    expect(
      screen.getByRole("button", { name: /Start Styling.*cost: 10 Percoins/ })
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Buy Percoins" }));

    expect(routerPushMock).toHaveBeenCalledWith("/credits/purchase");
  });

  // 本 PR で追加した selectedRemoteSource 経路 (ストック / 生成済み) のテスト
  describe("ImageSourcePicker 統合 (sourceImageStockId / sourceImageGeneratedId)", () => {
    test("ストック画像選択 → 生成で /style/generate-async に sourceImageStockId が含まれる", async () => {
      // 認証済みユーザーは async 経路を使う
      statusPayloadQueue.push({
        authState: "authenticated",
        remainingDaily: 5,
        showRemainingWarning: false,
      });

      render(<StylePageClient presets={presets} />);

      // picker トリガクリック → picker open
      await act(async () => {
        fireEvent.click(screen.getByTestId("mock-picker-trigger"));
        await flushReactScheduler();
      });
      // ストック選択
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: "mock-select-stock" }),
        );
        await flushReactScheduler();
      });

      // generate 押下
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: /Start Styling/ }),
        );
        await flushReactScheduler();
      });

      // /style/generate-async が呼ばれ、formData に sourceImageStockId が入る
      const generateCall = fetchMock.mock.calls.find(([input]) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : (input as Request).url;
        return url === "/style/generate-async";
      });
      expect(generateCall).toBeDefined();
      const [, init] = generateCall!;
      const formData = init?.body as FormData;
      expect(formData.get("sourceImageStockId")).toBe("stock-A");
      expect(formData.get("uploadImage")).toBeNull();
    });

    test("生成済み画像選択 → 生成で /style/generate-async に sourceImageGeneratedId が含まれる", async () => {
      statusPayloadQueue.push({
        authState: "authenticated",
        remainingDaily: 5,
        showRemainingWarning: false,
      });

      render(<StylePageClient presets={presets} />);

      await act(async () => {
        fireEvent.click(screen.getByTestId("mock-picker-trigger"));
        await flushReactScheduler();
      });
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: "mock-select-generated" }),
        );
        await flushReactScheduler();
      });
      await act(async () => {
        fireEvent.click(
          screen.getByRole("button", { name: /Start Styling/ }),
        );
        await flushReactScheduler();
      });

      const generateCall = fetchMock.mock.calls.find(([input]) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : (input as Request).url;
        return url === "/style/generate-async";
      });
      expect(generateCall).toBeDefined();
      const [, init] = generateCall!;
      const formData = init?.body as FormData;
      expect(formData.get("sourceImageGeneratedId")).toBe("gen-A");
      expect(formData.get("uploadImage")).toBeNull();
      expect(formData.get("sourceImageStockId")).toBeNull();
    });
  });
});
