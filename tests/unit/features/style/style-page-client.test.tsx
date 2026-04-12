import { act, fireEvent, render, screen } from "@testing-library/react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { StylePageClient } from "@/features/style/components/StylePageClient";
import type { StylePresetPublicSummary } from "@/features/style-presets/lib/schema";

jest.mock("next-intl", () => ({
  useTranslations: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

const mockRecordStyleUsageClientEvent = jest.fn();

jest.mock("@/features/style/lib/style-usage-client", () => ({
  recordStyleUsageClientEvent: (...args: unknown[]) => {
    mockRecordStyleUsageClientEvent(...args);
    return Promise.resolve();
  },
}));

const mockToast = jest.fn();

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
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

jest.mock("@/features/generation/lib/normalize-source-image", () => ({
  normalizeSourceImage: async (file: File) => file,
}));

const useTranslationsMock = useTranslations as jest.MockedFunction<
  typeof useTranslations
>;
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
  usageLimitHint:
    "Guest users can use this up to 2 times per day, and signed-in users up to 5 times per day.",
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
    "You have reached today's free trial limit. Sign up to keep using One-Tap Style.",
  authenticatedRateLimitDaily:
    "You have reached today's free generation limit.",
  authenticatedPaidContinueHint:
    "You can keep generating for {cost} Percoins per image.",
  authenticatedPaidInsufficientBalance:
    "Your balance is too low. Prepare at least {cost} Percoins to continue.",
  guestRateLimitSignupHint: "Create an account to keep going right away.",
  guestRateLimitSignupAction: "Sign up to continue",
  paidGenerateButton: "Continue for {cost} Percoins",
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

function translate(
  namespace: string | undefined,
  key: string,
  values?: Record<string, string | number>
): string {
  if (namespace === "coordinate") {
    return coordinateMessages[key as keyof typeof coordinateMessages] ?? key;
  }

  if (namespace !== "style") {
    return key;
  }

  const template = styleMessages[key as keyof typeof styleMessages] ?? key;
  if (!values) {
    return template;
  }

  return Object.entries(values).reduce((message, [token, value]) => {
    return message.replace(`{${token}}`, String(value));
  }, template);
}

const presets: readonly StylePresetPublicSummary[] = [
  {
    id: "c3f48c0b-54d2-4c4d-a18c-bd358b58d3b1",
    title: "PARIS CODE",
    thumbnailImageUrl: "https://example.com/style-presets/paris-code.webp",
    thumbnailWidth: 912,
    thumbnailHeight: 1173,
    hasBackgroundPrompt: true,
  },
  {
    id: "a4d8859c-c8ab-4b53-9b97-d9b0e6970a2e",
    title: "FLUFFY PAJAMAS CODE LONG TITLE",
    thumbnailImageUrl: "https://example.com/style-presets/fluffy-pajamas-code.webp",
    thumbnailWidth: 640,
    thumbnailHeight: 480,
    hasBackgroundPrompt: false,
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

  beforeEach(() => {
    routerPushMock = jest.fn();
    useRouterMock.mockReturnValue({
      push: routerPushMock,
      refresh: jest.fn(),
    } as unknown as ReturnType<typeof useRouter>);

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
      }),
      createJsonResponse({
        id: "style-job-001",
        status: "succeeded",
        processingStage: "completed",
        resultImageUrl: "https://cdn.example.com/generated-style-result.png",
        previewImageUrl: null,
        errorMessage: null,
      }),
    ];
    scrollIntoViewMock = jest.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewMock,
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
    global.fetch = originalFetch;
    mockToast.mockReset();
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
      name: "Start Styling",
    });
    expect(generateButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Add image" }));

    expect(generateButton).toBeEnabled();
  });

  test("背景変更対応presetではチェックボックスが有効で送信時にbackgroundChange=falseを含む", async () => {
    jest.useFakeTimers();

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

    fireEvent.click(screen.getByRole("button", { name: "Add image" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start Styling" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const generateCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        (typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url) ===
          "/style/generate" && (init?.method ?? "GET") === "POST"
    );
    expect(generateCall).toBeDefined();
    const [, init] = generateCall!;
    const formData = init?.body as FormData;
    expect(formData.get("backgroundChange")).toBe("false");
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
    jest.useFakeTimers();

    let resolveFetch: ((value: Response) => void) | null = null;
    generateResponseQueue = [
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    ];

    render(<StylePageClient presets={presets} />);

    fireEvent.click(screen.getByRole("button", { name: "Add image" }));
    fireEvent.click(screen.getByRole("button", { name: "Start Styling" }));

    expect(screen.getByRole("button", { name: "Generating..." })).toBeDisabled();
    expect(
      screen.getByText("Styling in progress")
    ).toBeInTheDocument();
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

    expect(screen.getByRole("button", { name: "Start Styling" })).toBeEnabled();
  });

  test("生成が長引くとフォールバック文言に切り替わる", () => {
    jest.useFakeTimers();

    generateResponseQueue = [new Promise<Response>(() => {})];

    render(<StylePageClient presets={presets} />);

    fireEvent.click(screen.getByRole("button", { name: "Add image" }));
    fireEvent.click(screen.getByRole("button", { name: "Start Styling" }));

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
    jest.useFakeTimers();

    render(<StylePageClient presets={presets} />);

    fireEvent.click(screen.getByRole("button", { name: "Add image" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start Styling" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalled();

    expect(
      await screen.findByText("Styling is complete.")
    ).toBeInTheDocument();
    expect(
      await screen.findByText("The reveal is coming up in a moment!")
    ).toBeInTheDocument();
    expect(screen.queryByAltText("Generated result")).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(await screen.findByAltText("Generated result")).toHaveAttribute(
      "src",
      "data:image/png;base64,generated-image-base64"
    );
    expect(screen.getByAltText("Generated result")).toHaveClass(
      "md:max-h-[550px]"
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
      fireEvent.click(screen.getByRole("button", { name: "Start Styling" }));
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

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(await screen.findByAltText("Generated result")).toHaveAttribute(
      "src",
      "https://cdn.example.com/generated-style-result.png"
    );
    expect(mockRecordStyleUsageClientEvent).toHaveBeenCalledWith({
      eventType: "generate",
      styleId: "c3f48c0b-54d2-4c4d-a18c-bd358b58d3b1",
    });
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
      fireEvent.click(screen.getByRole("button", { name: "Start Styling" }));
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

  test("生成結果がある状態で変更操作をすると確認ダイアログが表示され_キャンセルで結果を保持する", async () => {
    jest.useFakeTimers();

    render(<StylePageClient presets={presets} />);

    fireEvent.click(screen.getByRole("button", { name: "Add image" }));
    fireEvent.click(screen.getByRole("button", { name: "Start Styling" }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(await screen.findByAltText("Generated result")).toHaveAttribute(
      "src",
      "data:image/png;base64,generated-image-base64"
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: /FLUFFY PAJAMAS CODE LONG TITLE style card/i,
      })
    );

    expect(
      screen.getByText("This will clear the current result")
    ).toBeInTheDocument();
    expect(await screen.findByAltText("Generated result")).toHaveAttribute(
      "src",
      "data:image/png;base64,generated-image-base64"
    );

    fireEvent.click(screen.getByRole("button", { name: "Keep result" }));

    expect(
      screen.queryByText("This will clear the current result")
    ).not.toBeInTheDocument();
    expect(screen.getByAltText("Generated result")).toHaveAttribute(
      "src",
      "data:image/png;base64,generated-image-base64"
    );
    expect(
      screen.getByRole("button", { name: /PARIS CODE style card/ })
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("生成結果がある状態で変更確認に同意すると結果を削除して変更を反映する", async () => {
    jest.useFakeTimers();

    render(<StylePageClient presets={presets} />);

    fireEvent.click(screen.getByRole("button", { name: "Add image" }));
    fireEvent.click(screen.getByRole("button", { name: "Start Styling" }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(screen.getByAltText("Generated result")).toHaveAttribute(
      "src",
      "data:image/png;base64,generated-image-base64"
    );

    fireEvent.click(screen.getByRole("radio", { name: "Photo" }));

    expect(
      screen.getByText("This will clear the current result")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.queryByAltText("Generated result")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Photo" })).toBeChecked();
    expect(
      screen.getByText("Your generated image will appear here.")
    ).toBeInTheDocument();
  });

  test("生成結果がある状態でStart Stylingを押すと確認ダイアログが表示され_続行後に再生成する", async () => {
    jest.useFakeTimers();

    render(<StylePageClient presets={presets} />);

    fireEvent.click(screen.getByRole("button", { name: "Add image" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Start Styling" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(await screen.findByAltText("Generated result")).toHaveAttribute(
      "src",
      "data:image/png;base64,generated-image-base64"
    );

    fireEvent.click(screen.getByRole("button", { name: "Start Styling" }));

    expect(
      screen.getByText("This will replace the current result")
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Generate again" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(4);

    expect(
      await screen.findByText("Styling is complete.")
    ).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(await screen.findByAltText("Generated result")).toHaveAttribute(
      "src",
      "data:image/png;base64,generated-image-base64"
    );
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
      fireEvent.click(screen.getByRole("button", { name: "Start Styling" }));
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
      fireEvent.click(screen.getByRole("button", { name: "Start Styling" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Start Styling" }));

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
    generateResponseQueue = [
      createJsonResponse(
        {
          error:
            "You have reached today's free trial limit. Sign up to keep using One-Tap Style.",
          errorCode: "STYLE_RATE_LIMIT_DAILY",
          signupCta: true,
          signupPath: "/signup?next=%2Fstyle",
        },
        false
      ),
    ];

    render(<StylePageClient presets={presets} />);

    fireEvent.click(screen.getByRole("button", { name: "Add image" }));
    fireEvent.click(screen.getByRole("button", { name: "Start Styling" }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      screen.getByText(
        "You have reached today's free trial limit. Sign up to keep using One-Tap Style."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText("Create an account to keep going right away.")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sign up to continue" }));

    expect(routerPushMock).toHaveBeenCalledWith("/signup?next=%2Fstyle");
  });

  test("短時間制限エラー時_ダイアログを表示する", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Add image" }));
    fireEvent.click(screen.getByRole("button", { name: "Start Styling" }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

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
      screen.getByText(
        "Guest users can use this up to 2 times per day, and signed-in users up to 5 times per day."
      )
    ).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "Add image" }));
    fireEvent.click(screen.getByRole("button", { name: "Start Styling" }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      screen.getByText(
        "Guest users can use this up to 2 times per day, and signed-in users up to 5 times per day."
      )
    ).toBeInTheDocument();
    expect(
      await screen.findByText("You have 1 generations left for today.")
    ).toBeInTheDocument();
  });

  test("未ログインユーザーが上限到達時_signupカードを表示して生成を止める", async () => {
    statusPayloadQueue = [
      {
        authState: "guest",
        remainingDaily: 0,
        showRemainingWarning: true,
      },
    ];

    render(<StylePageClient presets={presets} />);

    expect(
      await screen.findByText(
        "You have reached today's free trial limit. Sign up to keep using One-Tap Style."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText("Create an account to keep going right away.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("You have 0 generations left for today.")
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add image" }));

    expect(
      screen.getByRole("button", { name: "Start Styling" })
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Sign up to continue" }));

    expect(routerPushMock).toHaveBeenCalledWith("/signup?next=%2Fstyle");
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
      screen.getByRole("button", { name: "Continue for 10 Percoins" })
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
      screen.getByRole("button", { name: "Continue for 10 Percoins" })
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Buy Percoins" }));

    expect(routerPushMock).toHaveBeenCalledWith("/my-page/credits/purchase");
  });
});
