/** @jest-environment node */

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
const STYLE_ID = "c3f48c0b-54d2-4c4d-a18c-bd358b58d3b1";

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
          ? {
              id: STYLE_ID,
              stylingPrompt: "RAW PROMPT\nSECOND LINE",
              backgroundPrompt: null,
            }
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
        imageConfig: { imageSize: string };
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

  test("postStyleGenerateRoute_OpenAIモデルはGEMINI_API_KEY無しでも生成できる", async () => {
    const openaiClient = jest.fn().mockResolvedValue({
      data: "openai-generated-image-base64",
      mimeType: "image/png",
    }) as jest.MockedFunction<StyleOpenAIClient>;
    const formData = new FormData();
    formData.set("styleId", STYLE_ID);
    formData.set("model", "gpt-image-2-low");
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
        "本日の無料お試し回数が上限に達しました。新規登録すると引き続き利用できます。",
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

  test("postStyleGenerateRoute_backgroundChange有効時_背景promptを合成する", async () => {
    getPublishedStylePresetForGenerationFn.mockResolvedValueOnce({
      id: STYLE_ID,
      stylingPrompt: "RAW PROMPT\nSECOND LINE",
      backgroundPrompt: "Soft spring city street with blossoms",
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

  test("postStyleGenerateRoute_upstream5xx時_releaseして同じstatusを返す", async () => {
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

    expect(response.status).toBe(503);
    expect(body.error).toBe("upstream overloaded");
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
});
