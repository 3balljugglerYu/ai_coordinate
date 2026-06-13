/** @jest-environment node */

// resolveAllPromptTemplates が next/cache + admin client を使うため、
// test 環境では空 dict を返すスタブにする (pure builder が registry default に
// フォールバックするので既存挙動と等価)
jest.mock("@/features/generation-prompts/lib/resolve-templates", () => ({
  resolveAllPromptTemplates: jest.fn().mockResolvedValue({}),
  PROMPT_OVERRIDES_CACHE_TAG: "prompt-overrides",
}));
jest.mock("next/cache", () => ({
  cacheTag: jest.fn(),
  cacheLife: jest.fn(),
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
}));

jest.mock("@/features/generation/lib/model-config", () => {
  const guestAllowedModels = [
    "gpt-image-2-low-1k",
    "gemini-3.1-flash-image-preview-512",
  ];

  return {
    ...jest.requireActual("@/features/generation/lib/model-config"),
    GEMINI_GENERATION_ENABLED: true,
    GUEST_ALLOWED_MODELS: guestAllowedModels,
    isModelAvailableForGeneration: jest.fn((model?: string | null) =>
      typeof model === "string"
    ),
    isCanonicalGuestAllowedModel: jest.fn((model?: string | null) =>
      guestAllowedModels.includes(model ?? "")
    ),
    parseGuestRequestedModel: jest.fn((raw?: string | null) => {
      if (raw === "gpt-image-2-low-1k") return "gpt-image-2-low-1k";
      if (
        raw === "gemini-3.1-flash-image-preview-512" ||
        raw === "gemini-3.1-flash-image-preview" ||
        raw === "gemini-2.5-flash-image" ||
        raw === "gemini-2.5-flash-image-preview"
      ) {
        return "gemini-3.1-flash-image-preview-512";
      }
      return null;
    }),
  };
});

import { NextRequest } from "next/server";
import { postStyleGenerateRoute } from "@/app/(app)/style/generate/handler";
import type {
  StyleGenerateAttemptReservation,
  StyleGenerateRateLimitResult,
} from "@/features/style/lib/style-rate-limit";
import {
  STYLE_PROMPT_BASE_PREFIX,
  STYLE_PROMPT_CHANGE_BACKGROUND_SUFFIX,
  STYLE_PROMPT_ILLUSTRATION_SUFFIX,
  STYLE_PROMPT_KEEP_BACKGROUND_SUFFIX,
  STYLE_PROMPT_REAL_SUFFIX,
  buildStyleAttemptReinforcementPrefix,
} from "@/shared/generation/style-prompts";

type JsonRecord = Record<string, unknown>;
type StyleGenerateRouteDependencies = NonNullable<
  Parameters<typeof postStyleGenerateRoute>[1]
>;
type StyleOpenAIClient = NonNullable<
  StyleGenerateRouteDependencies["openaiClient"]
>;
type DownloadStylePresetReferenceImageFn = NonNullable<
  StyleGenerateRouteDependencies["downloadStylePresetReferenceImageFn"]
>;
const STYLE_ID = "c3f48c0b-54d2-4c4d-a18c-bd358b58d3b1";
const TEST_COORDINATE_CATEGORY = {
  id: "category-coordinate",
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
  visibility: "public",
  isActive: true,
};

function buildStylePresetForGeneration(
  overrides: Record<string, unknown> = {}
) {
  return {
    id: STYLE_ID,
    title: "PARIS CODE",
    thumbnailImageUrl: "https://example.com/style-presets/paris-code.webp",
    thumbnailWidth: 912,
    thumbnailHeight: 1173,
    hasBackgroundPrompt: false,
    stylingPrompt: "RAW PROMPT\nSECOND LINE",
    backgroundPrompt: null,
    status: "published",
    category: TEST_COORDINATE_CATEGORY,
    imageInputMode: "single",
    dualReferenceSource: "admin",
    referenceImageUrl: null,
    referenceImageStoragePath: null,
    ...overrides,
  };
}

function buildExpectedPrompt(params: {
  sourceImageType?: "illustration" | "real";
  backgroundInstruction: string;
  backgroundPrompt?: string | null;
}): string {
  const promptSuffix =
    params.sourceImageType === "real"
      ? STYLE_PROMPT_REAL_SUFFIX
      : STYLE_PROMPT_ILLUSTRATION_SUFFIX;

  const promptSections = [
    STYLE_PROMPT_BASE_PREFIX,
    promptSuffix,
    params.backgroundInstruction,
    "Styling Direction:\nRAW PROMPT\nSECOND LINE",
  ];

  if (params.backgroundPrompt) {
    promptSections.push(`Background Direction:\n${params.backgroundPrompt}`);
  }

  return promptSections.join("\n\n");
}

function createRequest(formData: FormData): NextRequest {
  return new NextRequest("http://localhost/style/generate", {
    method: "POST",
    headers: {
      "accept-language": "ja",
    },
    body: formData,
  });
}

async function readJson(response: Response): Promise<JsonRecord> {
  return (await response.json()) as JsonRecord;
}

function createUploadImage(
  options: { type?: string; size?: number; name?: string } = {}
): File {
  const {
    type = "image/png",
    size = 16,
    name = "upload-image.png",
  } = options;

  return new File([new Uint8Array(size)], name, { type });
}

function createPngHeader(width: number, height: number): ArrayBuffer {
  const buf = Buffer.alloc(24);
  buf.writeUInt32BE(0x89504e47, 0);
  buf.writeUInt32BE(0x0d0a1a0a, 4);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12);
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer;
}

function createSuccessResponse() {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: "image/png",
                  data: "generated-image-base64",
                },
              },
            ],
          },
          finishReason: "STOP",
        },
      ],
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}

describe("StyleGenerateRoute integration tests", () => {
  let fetchFn: jest.MockedFunction<typeof fetch>;
  let getUserFn: jest.Mock;
  let getPublishedStylePresetForGenerationFn: jest.Mock;
  let recordStyleUsageEventFn: jest.Mock<Promise<void>, [unknown]>;
  let checkAndConsumeRateLimitFn: jest.Mock<
    Promise<StyleGenerateRateLimitResult>,
    [{ request: NextRequest; userId: string | null; styleId: string }]
  >;
  let releaseRateLimitAttemptFn: jest.Mock<
    Promise<boolean>,
    [
      {
        reservation: StyleGenerateAttemptReservation | null | undefined;
        reason:
          | "upload_failed"
          | "job_create_failed"
          | "queue_failed"
          | "timeout"
          | "upstream_error"
          | "no_image_generated"
          | "worker_failed"
          | "infra_error";
      },
    ]
  >;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchFn = jest.fn().mockResolvedValue(createSuccessResponse()) as jest.MockedFunction<
      typeof fetch
    >;
    // /style/generate は UCL-014 でゲスト専用（認証ユーザーは 403）。
    // 既定はゲスト（null）にして、認証ユーザー拒否ケースだけ明示的に上書きする。
    getUserFn = jest.fn().mockResolvedValue(null);
    getPublishedStylePresetForGenerationFn = jest
      .fn()
      .mockImplementation(async (styleId: string) =>
        styleId === STYLE_ID
          ? buildStylePresetForGeneration()
          : null
      );
    recordStyleUsageEventFn = jest.fn().mockResolvedValue(undefined);
    checkAndConsumeRateLimitFn = jest
      .fn<
        Promise<StyleGenerateRateLimitResult>,
        [{ request: NextRequest; userId: string | null; styleId: string }]
      >()
      .mockResolvedValue({ allowed: true });
    releaseRateLimitAttemptFn = jest.fn().mockResolvedValue(true);
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {
      // keep test output deterministic
    });
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {
      // keep test output deterministic
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    jest.restoreAllMocks();
  });

  test("postStyleGenerateRoute_未認証の場合_guestとして生成できる", async () => {
    getUserFn.mockResolvedValueOnce(null);
    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());

    const response = await postStyleGenerateRoute(createRequest(formData), {
      fetchFn,
      geminiApiKey: "test-api-key",
      getUserFn,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({
      imageDataUrl: "data:image/png;base64,generated-image-base64",
      mimeType: "image/png",
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(checkAndConsumeRateLimitFn).toHaveBeenCalledWith({
      request: expect.any(NextRequest),
      userId: null,
      styleId: STYLE_ID,
    });
    expect(recordStyleUsageEventFn).toHaveBeenCalledTimes(2);
    expect(recordStyleUsageEventFn).toHaveBeenNthCalledWith(1, {
      userId: null,
      authState: "guest",
      eventType: "generate_attempt",
      styleId: STYLE_ID,
    });
    expect(recordStyleUsageEventFn).toHaveBeenNthCalledWith(2, {
      userId: null,
      authState: "guest",
      eventType: "generate",
      styleId: STYLE_ID,
    });
  });

  test("postStyleGenerateRoute_不正styleIdの場合_400を返す", async () => {
    const formData = new FormData();
    formData.set("styleId", "unknown-style");
    formData.set("uploadImage", createUploadImage());

    const response = await postStyleGenerateRoute(createRequest(formData), {
      fetchFn,
      geminiApiKey: "test-api-key",
      getUserFn,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe("無効なスタイルです。");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("postStyleGenerateRoute_uploadImage未指定の場合_400を返す", async () => {
    const formData = new FormData();
    formData.set("styleId", STYLE_ID);

    const response = await postStyleGenerateRoute(createRequest(formData), {
      fetchFn,
      geminiApiKey: "test-api-key",
      getUserFn,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe("アップロード画像を選択してください。");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("postStyleGenerateRoute_不正uploadImage形式の場合_400を返す", async () => {
    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set(
      "uploadImage",
      createUploadImage({ type: "image/gif", name: "upload-image.gif" })
    );

    const response = await postStyleGenerateRoute(createRequest(formData), {
      fetchFn,
      geminiApiKey: "test-api-key",
      getUserFn,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe(
      "アップロード画像は PNG / JPG / WebP のみ対応しています。"
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("postStyleGenerateRoute_成功時_rawPromptと固定Gemini設定で画像を返す", async () => {
    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("sourceImageType", "illustration");
    formData.set("uploadImage", createUploadImage());

    const response = await postStyleGenerateRoute(createRequest(formData), {
      fetchFn,
      geminiApiKey: "test-api-key",
      getUserFn,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({
      imageDataUrl: "data:image/png;base64,generated-image-base64",
      mimeType: "image/png",
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    const [url, init] = fetchFn.mock.calls[0];
    const requestBody = JSON.parse(String(init?.body)) as {
      contents: Array<{ parts: Array<Record<string, unknown>> }>;
      generationConfig: {
        candidateCount: number;
        responseModalities: string[];
        imageConfig: { imageSize: string; aspectRatio: string };
      };
    };

    expect(String(url)).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent"
    );
    expect(requestBody.contents[0].parts[0]).toEqual({
      text: buildExpectedPrompt({
        backgroundInstruction:
          STYLE_PROMPT_KEEP_BACKGROUND_SUFFIX,
      }),
    });
    expect(requestBody.contents[0].parts).toHaveLength(2);
    expect(requestBody.contents[0].parts[1]).toEqual({
      inline_data: {
        mime_type: "image/png",
        data: Buffer.alloc(16).toString("base64"),
      },
    });
    expect(requestBody.generationConfig).toEqual({
      candidateCount: 1,
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        imageSize: "512",
        // 16 byte の zero buffer は parseImageDimensions が null を返すため、
        // resolveGeminiAspectRatio フォールバックで "1:1" になる。
        aspectRatio: "1:1",
      },
    });
    expect(checkAndConsumeRateLimitFn).toHaveBeenCalledWith({
      request: expect.any(NextRequest),
      userId: null,
      styleId: STYLE_ID,
    });
    // ゲスト経路では reserve 後に "generate_attempt"、成功後に "generate" の 2 イベントが発火する
    expect(recordStyleUsageEventFn).toHaveBeenCalledTimes(2);
    expect(recordStyleUsageEventFn).toHaveBeenNthCalledWith(1, {
      userId: null,
      authState: "guest",
      eventType: "generate_attempt",
      styleId: STYLE_ID,
    });
    expect(recordStyleUsageEventFn).toHaveBeenNthCalledWith(2, {
      userId: null,
      authState: "guest",
      eventType: "generate",
      styleId: STYLE_ID,
    });
  });

  test("postStyleGenerateRoute_dualプリセットはゲスト経路でもreference画像を送信する", async () => {
    const referenceBytes = new Uint8Array([7, 8, 9]);
    const downloadStylePresetReferenceImageFn = jest
      .fn<
        ReturnType<DownloadStylePresetReferenceImageFn>,
        Parameters<DownloadStylePresetReferenceImageFn>
      >()
      .mockResolvedValue(
        new File([referenceBytes], "reference.webp", {
          type: "image/webp",
        })
      );
    getPublishedStylePresetForGenerationFn.mockResolvedValueOnce(
      buildStylePresetForGeneration({
        imageInputMode: "dual",
        referenceImageUrl: "https://example.com/reference.webp",
        referenceImageStoragePath: "style-presets/preset-1/reference.webp",
      })
    );

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());

    const response = await postStyleGenerateRoute(createRequest(formData), {
      fetchFn,
      geminiApiKey: "test-api-key",
      getUserFn,
      getPublishedStylePresetForGenerationFn,
      downloadStylePresetReferenceImageFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({
      imageDataUrl: "data:image/png;base64,generated-image-base64",
      mimeType: "image/png",
    });
    expect(downloadStylePresetReferenceImageFn).toHaveBeenCalledWith(
      "style-presets/preset-1/reference.webp"
    );

    const [, init] = fetchFn.mock.calls[0];
    const requestBody = JSON.parse(String(init?.body)) as {
      contents: Array<{ parts: Array<Record<string, unknown>> }>;
    };
    expect(requestBody.contents[0].parts).toHaveLength(3);
    expect(requestBody.contents[0].parts[2]).toEqual({
      inline_data: {
        mime_type: "image/webp",
        data: Buffer.from(referenceBytes).toString("base64"),
      },
    });
  });

  test("postStyleGenerateRoute_dualプリセットでもrateLimit拒否時はreference画像を取得しない", async () => {
    const downloadStylePresetReferenceImageFn = jest
      .fn<
        ReturnType<DownloadStylePresetReferenceImageFn>,
        Parameters<DownloadStylePresetReferenceImageFn>
      >()
      .mockResolvedValue(
        new File([new Uint8Array([7, 8, 9])], "reference.webp", {
          type: "image/webp",
        })
      );
    getPublishedStylePresetForGenerationFn.mockResolvedValueOnce(
      buildStylePresetForGeneration({
        imageInputMode: "dual",
        referenceImageUrl: "https://example.com/reference.webp",
        referenceImageStoragePath: "style-presets/preset-1/reference.webp",
      })
    );
    checkAndConsumeRateLimitFn.mockResolvedValueOnce({
      allowed: false,
      reason: "guest_daily",
    });

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());

    const response = await postStyleGenerateRoute(createRequest(formData), {
      fetchFn,
      geminiApiKey: "test-api-key",
      getUserFn,
      getPublishedStylePresetForGenerationFn,
      downloadStylePresetReferenceImageFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });

    expect(response.status).toBe(429);
    expect(downloadStylePresetReferenceImageFn).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("postStyleGenerateRoute_カテゴリが正方形固定ならGeminiへ1:1を送る", async () => {
    getPublishedStylePresetForGenerationFn.mockResolvedValueOnce(
      buildStylePresetForGeneration({
        // 正方形固定の挙動確認が主眼。ゲスト経路は coordinate カテゴリのみ許可
        // されるため key は coordinate のままアスペクト比モードだけ square にする。
        category: {
          ...TEST_COORDINATE_CATEGORY,
          outputAspectRatioMode: "square",
        },
      })
    );

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set(
      "uploadImage",
      new File([createPngHeader(1600, 900)], "wide.png", {
        type: "image/png",
      })
    );

    const response = await postStyleGenerateRoute(createRequest(formData), {
      fetchFn,
      geminiApiKey: "test-api-key",
      getUserFn,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });

    expect(response.status).toBe(200);
    const [, init] = fetchFn.mock.calls[0];
    const requestBody = JSON.parse(String(init?.body)) as {
      generationConfig: {
        imageConfig?: { imageSize?: string; aspectRatio?: string };
      };
    };
    expect(requestBody.generationConfig.imageConfig).toEqual({
      imageSize: "512",
      aspectRatio: "1:1",
    });
  });

  test("postStyleGenerateRoute_OpenAIモデルはGEMINI_API_KEY無しでも生成できる", async () => {
    const openaiClient = jest.fn().mockResolvedValue({
      data: "openai-generated-image-base64",
      mimeType: "image/png",
    }) as jest.MockedFunction<StyleOpenAIClient>;
    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("model", "gpt-image-2-low-1k");
    formData.set("uploadImage", createUploadImage());

    const response = await postStyleGenerateRoute(createRequest(formData), {
      fetchFn,
      openaiApiKey: "openai-key",
      openaiClient,
      getUserFn,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({
      imageDataUrl: "data:image/png;base64,openai-generated-image-base64",
      mimeType: "image/png",
    });
    expect(openaiClient).toHaveBeenCalledTimes(1);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("postStyleGenerateRoute_guest短時間制限時_429とsignup導線を返す", async () => {
    getUserFn.mockResolvedValueOnce(null);
    checkAndConsumeRateLimitFn.mockResolvedValueOnce({
      allowed: false,
      reason: "guest_short",
    });

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());

    const response = await postStyleGenerateRoute(createRequest(formData), {
      fetchFn,
      geminiApiKey: "test-api-key",
      getUserFn,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(429);
    expect(body).toEqual({
      error: "サーバーが混み合っています。時間をおいて再度お試しください。",
      errorCode: "STYLE_RATE_LIMIT_SHORT",
      showRateLimitDialog: true,
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(recordStyleUsageEventFn).toHaveBeenCalledWith({
      userId: null,
      authState: "guest",
      eventType: "rate_limited",
      styleId: STYLE_ID,
    });
  });

  test("postStyleGenerateRoute_guest日次制限時_429とsignup導線を返す", async () => {
    getUserFn.mockResolvedValueOnce(null);
    checkAndConsumeRateLimitFn.mockResolvedValueOnce({
      allowed: false,
      reason: "guest_daily",
    });

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());

    const response = await postStyleGenerateRoute(createRequest(formData), {
      fetchFn,
      geminiApiKey: "test-api-key",
      getUserFn,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(429);
    expect(body).toEqual({
      error:
        "本日のお試し回数（1 日 1 回）に達しました。ログイン / 新規登録すると引き続き利用できます。",
      errorCode: "STYLE_RATE_LIMIT_DAILY",
      signupCta: true,
      signupPath: "/signup?next=%2Fstyle&signup_source=style",
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(recordStyleUsageEventFn).toHaveBeenCalledWith({
      userId: null,
      authState: "guest",
      eventType: "rate_limited",
      styleId: STYLE_ID,
    });
  });

  test("postStyleGenerateRoute_guest識別子取得失敗時_400で拒否する", async () => {
    // UCL-010: IP も Cookie も無いと無制限利用を許してしまうため、明示拒否する
    getUserFn.mockResolvedValueOnce(null);
    checkAndConsumeRateLimitFn.mockResolvedValueOnce({
      allowed: false,
      reason: "missing_identifier",
    });

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());

    const response = await postStyleGenerateRoute(createRequest(formData), {
      fetchFn,
      geminiApiKey: "test-api-key",
      getUserFn,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: expect.any(String),
      errorCode: "STYLE_GUEST_IDENTIFIER_UNAVAILABLE",
    });
    expect(fetchFn).not.toHaveBeenCalled();
    // missing_identifier は reserve に到達していないので usage event は発火しない
    expect(recordStyleUsageEventFn).not.toHaveBeenCalled();
  });

  test("postStyleGenerateRoute_認証ユーザーの直叩きは403で拒否される", async () => {
    // UCL-014 / ADR-007: 認証済みユーザーが guest sync ルートを直接叩いたら 403。
    // フロントは authState で経路を分けるためここに到達しない想定だが、サーバー側で必ず弾く。
    getUserFn.mockResolvedValueOnce({ id: "user-123" });

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());

    const response = await postStyleGenerateRoute(createRequest(formData), {
      fetchFn,
      geminiApiKey: "test-api-key",
      getUserFn,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: expect.any(String),
      errorCode: "GUEST_ROUTE_AUTHENTICATED_FORBIDDEN",
    });
    // 拒否は reserve に到達する前に行うため、レート制限・モデル呼び出し・記録は発火しない
    expect(checkAndConsumeRateLimitFn).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(recordStyleUsageEventFn).not.toHaveBeenCalled();
  });

  test("postStyleGenerateRoute_real選択時_前置きpromptをphotorealistic向けに切り替える", async () => {
    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("sourceImageType", "real");
    formData.set("uploadImage", createUploadImage());

    const response = await postStyleGenerateRoute(createRequest(formData), {
      fetchFn,
      geminiApiKey: "test-api-key",
      getUserFn,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({
      imageDataUrl: "data:image/png;base64,generated-image-base64",
      mimeType: "image/png",
    });

    const [, init] = fetchFn.mock.calls[0];
    const requestBody = JSON.parse(String(init?.body)) as {
      contents: Array<{ parts: Array<Record<string, unknown>> }>;
    };

    expect(requestBody.contents[0].parts[0]).toEqual({
      text: buildExpectedPrompt({
        sourceImageType: "real",
        backgroundInstruction:
          STYLE_PROMPT_KEEP_BACKGROUND_SUFFIX,
      }),
    });
  });

  test("postStyleGenerateRoute_カテゴリで非表示のstyleフォーム項目は既定値に固定する", async () => {
    const openaiClient = jest.fn().mockResolvedValue({
      data: "openai-generated-image-base64",
      mimeType: "image/png",
    }) as jest.MockedFunction<StyleOpenAIClient>;
    getPublishedStylePresetForGenerationFn.mockResolvedValueOnce({
      ...buildStylePresetForGeneration({
        backgroundPrompt: "Soft spring city street with blossoms",
        hasBackgroundPrompt: true,
        category: {
          ...TEST_COORDINATE_CATEGORY,
          showSourceImageTypeControl: false,
          showBackgroundChangeControl: false,
          showGenerationModelControl: false,
        },
      }),
    });

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("sourceImageType", "real");
    formData.set("backgroundChange", "true");
    formData.set("model", "gemini-3.1-flash-image-preview-512");
    formData.set("uploadImage", createUploadImage());

    const response = await postStyleGenerateRoute(createRequest(formData), {
      fetchFn,
      openaiApiKey: "openai-key",
      openaiClient,
      getUserFn,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });

    expect(response.status).toBe(200);
    expect(openaiClient).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: buildExpectedPrompt({
          backgroundInstruction: STYLE_PROMPT_KEEP_BACKGROUND_SUFFIX,
        }),
      }),
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("postStyleGenerateRoute_運営限定カテゴリはguest生成不可", async () => {
    getPublishedStylePresetForGenerationFn.mockResolvedValueOnce(
      buildStylePresetForGeneration({
        category: {
          ...TEST_COORDINATE_CATEGORY,
          key: "chibi",
          displayNameJa: "ちびキャラ",
          displayNameEn: "Chibi",
          visibility: "admin_only",
        },
      })
    );

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());

    const response = await postStyleGenerateRoute(createRequest(formData), {
      fetchFn,
      geminiApiKey: "test-api-key",
      getUserFn,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("STYLE_INVALID_STYLE");
    expect(checkAndConsumeRateLimitFn).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("postStyleGenerateRoute_coordinate以外の公開カテゴリはguest生成不可(403)", async () => {
    getPublishedStylePresetForGenerationFn.mockResolvedValueOnce(
      buildStylePresetForGeneration({
        category: {
          ...TEST_COORDINATE_CATEGORY,
          key: "chibi",
          displayNameJa: "ちびキャラ",
          displayNameEn: "Chibi",
          visibility: "public",
        },
      })
    );

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());

    const response = await postStyleGenerateRoute(createRequest(formData), {
      fetchFn,
      geminiApiKey: "test-api-key",
      getUserFn,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(401);
    expect(body.errorCode).toBe("STYLE_CATEGORY_REQUIRES_AUTH");
    // 生成枠の消費や provider 呼び出しは行わない
    expect(checkAndConsumeRateLimitFn).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("postStyleGenerateRoute_神コレ(collectible_wafer_sticker_god_6p)公開時もguest生成不可(403)", async () => {
    // 企画開始時に公開予定のカテゴリ。公開（visibility: public）に変わっても
    // 未ログインユーザーは生成できないことを、実カテゴリキーで明示的に固定する。
    getPublishedStylePresetForGenerationFn.mockResolvedValueOnce(
      buildStylePresetForGeneration({
        category: {
          ...TEST_COORDINATE_CATEGORY,
          key: "collectible_wafer_sticker_god_6p",
          displayNameJa: "神コレ",
          displayNameEn: "Collectible Wafer Sticker (God) 6P",
          visibility: "public",
        },
      })
    );

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());

    const response = await postStyleGenerateRoute(createRequest(formData), {
      fetchFn,
      geminiApiKey: "test-api-key",
      getUserFn,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(401);
    expect(body.errorCode).toBe("STYLE_CATEGORY_REQUIRES_AUTH");
    expect(checkAndConsumeRateLimitFn).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("postStyleGenerateRoute_backgroundChange有効時_背景promptを合成する", async () => {
    getPublishedStylePresetForGenerationFn.mockResolvedValueOnce({
      ...buildStylePresetForGeneration({
        backgroundPrompt: "Soft spring city street with blossoms",
        hasBackgroundPrompt: true,
      }),
    });

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("backgroundChange", "true");
    formData.set("uploadImage", createUploadImage());

    const response = await postStyleGenerateRoute(createRequest(formData), {
      fetchFn,
      geminiApiKey: "test-api-key",
      getUserFn,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({
      imageDataUrl: "data:image/png;base64,generated-image-base64",
      mimeType: "image/png",
    });

    const [, init] = fetchFn.mock.calls[0];
    const requestBody = JSON.parse(String(init?.body)) as {
      contents: Array<{ parts: Array<Record<string, unknown>> }>;
    };

    expect(requestBody.contents[0].parts[0]).toEqual({
      text: buildExpectedPrompt({
        backgroundInstruction: STYLE_PROMPT_CHANGE_BACKGROUND_SUFFIX,
        backgroundPrompt: "Soft spring city street with blossoms",
      }),
    });
  });

  test("postStyleGenerateRoute_backgroundChange有効かつbackgroundPrompt未設定時_400を返す", async () => {
    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("backgroundChange", "true");
    formData.set("uploadImage", createUploadImage());

    const response = await postStyleGenerateRoute(createRequest(formData), {
      fetchFn,
      geminiApiKey: "test-api-key",
      getUserFn,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe("このスタイルは背景変更に対応していません。");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("postStyleGenerateRoute_timeout時_504を返す", async () => {
    checkAndConsumeRateLimitFn.mockResolvedValueOnce({
      allowed: true,
      reservation: {
        authState: "guest",
        attemptId: "attempt-auth-001",
      },
    });
    fetchFn.mockRejectedValueOnce(
      Object.assign(new Error("aborted"), { name: "AbortError" })
    );

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());

    const response = await postStyleGenerateRoute(createRequest(formData), {
      fetchFn,
      geminiApiKey: "test-api-key",
      getUserFn,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(504);
    expect(body.error).toBe("画像生成がタイムアウトしました。もう一度お試しください。");
    // ゲストの reserve 直後に発火する generate_attempt のみ
    expect(recordStyleUsageEventFn).toHaveBeenCalledTimes(1);
    expect(recordStyleUsageEventFn).toHaveBeenCalledWith({
      userId: null,
      authState: "guest",
      eventType: "generate_attempt",
      styleId: STYLE_ID,
    });
    expect(releaseRateLimitAttemptFn).toHaveBeenCalledWith({
      reservation: {
        authState: "guest",
        attemptId: "attempt-auth-001",
      },
      reason: "timeout",
    });
  });

  test("postStyleGenerateRoute_safetyBlock時_400を返す", async () => {
    checkAndConsumeRateLimitFn.mockResolvedValueOnce({
      allowed: true,
      reservation: {
        authState: "guest",
        attemptId: "attempt-auth-001",
      },
    });
    fetchFn.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            message: "blocked for safety policy",
          },
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      )
    );

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());

    const response = await postStyleGenerateRoute(createRequest(formData), {
      fetchFn,
      geminiApiKey: "test-api-key",
      getUserFn,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe(
      "安全性でブロックされました。画像または指示を調整して再試行してください。"
    );
    expect(releaseRateLimitAttemptFn).not.toHaveBeenCalled();
  });

  test("postStyleGenerateRoute_noImageResponse時_502を返す", async () => {
    checkAndConsumeRateLimitFn.mockResolvedValueOnce({
      allowed: true,
      reservation: {
        authState: "guest",
        attemptId: "attempt-auth-001",
      },
    });
    fetchFn.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: "no image generated" }],
              },
              finishReason: "STOP",
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }
      )
    );

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());

    const response = await postStyleGenerateRoute(createRequest(formData), {
      fetchFn,
      geminiApiKey: "test-api-key",
      getUserFn,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(502);
    expect(body.error).toBe(
      "画像が生成されませんでした（finishReason: STOP）。別の画像や入力で再試行してください。"
    );
    expect(recordStyleUsageEventFn).toHaveBeenCalledTimes(1);
    expect(recordStyleUsageEventFn).toHaveBeenCalledWith({
      userId: null,
      authState: "guest",
      eventType: "generate_attempt",
      styleId: STYLE_ID,
    });
    expect(releaseRateLimitAttemptFn).toHaveBeenCalledWith({
      reservation: {
        authState: "guest",
        attemptId: "attempt-auth-001",
      },
      reason: "no_image_generated",
    });
  });

  test("postStyleGenerateRoute_upstream5xx時_releaseして汎用エラーを返す", async () => {
    checkAndConsumeRateLimitFn.mockResolvedValueOnce({
      allowed: true,
      reservation: {
        authState: "guest",
        attemptId: "attempt-auth-001",
      },
    });
    fetchFn.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            message: "upstream overloaded",
          },
        }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json",
          },
        }
      )
    );

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());

    const response = await postStyleGenerateRoute(createRequest(formData), {
      fetchFn,
      geminiApiKey: "test-api-key",
      getUserFn,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(502);
    expect(body.error).toBe(
      "画像生成サービスが一時的に利用できません。少し時間をおいて再試行してください。"
    );
    expect(releaseRateLimitAttemptFn).toHaveBeenCalledWith({
      reservation: {
        authState: "guest",
        attemptId: "attempt-auth-001",
      },
      reason: "upstream_error",
    });
  });

  test("postStyleGenerateRoute_MALFORMED_FUNCTION_CALLリトライ時_2回目にreinforcementPrefix付きで送信する", async () => {
    checkAndConsumeRateLimitFn.mockResolvedValueOnce({
      allowed: true,
      reservation: {
        authState: "guest",
        attemptId: "attempt-auth-001",
      },
    });
    fetchFn.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text: "" }] },
              finishReason: "MALFORMED_FUNCTION_CALL",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    fetchFn.mockResolvedValueOnce(createSuccessResponse());

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());

    const response = await postStyleGenerateRoute(createRequest(formData), {
      fetchFn,
      geminiApiKey: "test-api-key",
      getUserFn,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });

    expect(response.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(2);

    const firstBody = JSON.parse(
      String(fetchFn.mock.calls[0][1]?.body)
    ) as { contents: Array<{ parts: Array<{ text?: string }> }> };
    const secondBody = JSON.parse(
      String(fetchFn.mock.calls[1][1]?.body)
    ) as { contents: Array<{ parts: Array<{ text?: string }> }> };

    const firstText = firstBody.contents[0].parts[0].text ?? "";
    const secondText = secondBody.contents[0].parts[0].text ?? "";
    expect(firstText.startsWith("RETRY NOTICE")).toBe(false);
    expect(secondText.startsWith("RETRY NOTICE (attempt 2)")).toBe(true);
    expect(secondText).toBe(
      `${buildStyleAttemptReinforcementPrefix(2)}${firstText}`
    );
    expect(releaseRateLimitAttemptFn).not.toHaveBeenCalled();
  });

  test("postStyleGenerateRoute_dual user_upload では uploadImage2 を provider にそのまま渡し prompt に userPrompt を結合する", async () => {
    getPublishedStylePresetForGenerationFn.mockResolvedValueOnce(
      buildStylePresetForGeneration({
        imageInputMode: "dual",
        dualReferenceSource: "user_upload",
        category: {
          ...TEST_COORDINATE_CATEGORY,
          showUserPromptInput: true,
        },
      }),
    );

    const refBytes = new Uint8Array([1, 2, 3, 4]);
    const referenceFile = new File([refBytes], "user-ref.png", {
      type: "image/png",
    });

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());
    formData.set("uploadImage2", referenceFile);
    formData.set("userPrompt", "髪色をピンクに");

    const response = await postStyleGenerateRoute(createRequest(formData), {
      fetchFn,
      geminiApiKey: "test-api-key",
      getUserFn,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });

    expect(response.status).toBe(200);
    const [, init] = fetchFn.mock.calls[0];
    const requestBody = JSON.parse(String(init?.body)) as {
      contents: Array<{ parts: Array<Record<string, unknown>> }>;
    };
    // text + uploadImage + uploadImage2 の 3 つの parts が来る
    expect(requestBody.contents[0].parts).toHaveLength(3);
    expect(requestBody.contents[0].parts[2]).toEqual({
      inline_data: {
        mime_type: "image/png",
        data: Buffer.from(refBytes).toString("base64"),
      },
    });
    const promptText = String(requestBody.contents[0].parts[0].text);
    expect(promptText).toContain("User Visual Preferences:\n髪色をピンクに");
  });

  test("postStyleGenerateRoute_dual user_upload で uploadImage2 が無いと 400 STYLE_DUAL_USER_IMAGE_REQUIRED", async () => {
    getPublishedStylePresetForGenerationFn.mockResolvedValueOnce(
      buildStylePresetForGeneration({
        imageInputMode: "dual",
        dualReferenceSource: "user_upload",
      }),
    );

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());

    const response = await postStyleGenerateRoute(createRequest(formData), {
      fetchFn,
      geminiApiKey: "test-api-key",
      getUserFn,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("STYLE_DUAL_USER_IMAGE_REQUIRED");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("postStyleGenerateRoute_showUserPromptInput=true でも userPrompt が上限超過なら 400 STYLE_USER_PROMPT_TOO_LONG", async () => {
    getPublishedStylePresetForGenerationFn.mockResolvedValueOnce(
      buildStylePresetForGeneration({
        category: {
          ...TEST_COORDINATE_CATEGORY,
          showUserPromptInput: true,
        },
      }),
    );

    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("uploadImage", createUploadImage());
    formData.set("userPrompt", "あ".repeat(2000));

    const response = await postStyleGenerateRoute(createRequest(formData), {
      fetchFn,
      geminiApiKey: "test-api-key",
      getUserFn,
      getPublishedStylePresetForGenerationFn,
      recordStyleUsageEventFn,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("STYLE_USER_PROMPT_TOO_LONG");
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
