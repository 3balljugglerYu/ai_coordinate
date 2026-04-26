/** @jest-environment node */

import { NextRequest } from "next/server";
import { postCoordinateGenerateGuestRoute } from "@/app/api/coordinate-generate-guest/handler";

type JsonRecord = Record<string, unknown>;

function createRequest(formData: FormData): NextRequest {
  return new NextRequest("http://localhost/api/coordinate-generate-guest", {
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

function createPngImage(name = "input.png"): File {
  return new File([new Uint8Array(16)], name, { type: "image/png" });
}

const SUCCESSFUL_OPENAI_RESPONSE = {
  data: "RESULT_BASE64",
  mimeType: "image/png" as const,
};

const SUCCESSFUL_GEMINI_RESPONSE_BODY = JSON.stringify({
  candidates: [
    {
      content: {
        parts: [
          {
            inline_data: { mime_type: "image/png", data: "GEMINI_RESULT" },
          },
        ],
      },
    },
  ],
});

function createGeminiSuccessResponse() {
  return new Response(SUCCESSFUL_GEMINI_RESPONSE_BODY, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("CoordinateGenerateGuest integration", () => {
  let getUserFn: jest.Mock;
  let fetchFn: jest.MockedFunction<typeof fetch>;
  let openaiClient: jest.MockedFunction<
    Parameters<typeof postCoordinateGenerateGuestRoute>[1] extends infer D
      ? D extends { openaiClient?: infer C }
        ? NonNullable<C>
        : never
      : never
  >;
  let checkAndConsumeRateLimitFn: jest.Mock;
  let releaseRateLimitAttemptFn: jest.Mock;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    getUserFn = jest.fn().mockResolvedValue(null);
    fetchFn = jest.fn().mockResolvedValue(createGeminiSuccessResponse()) as jest.MockedFunction<typeof fetch>;
    openaiClient = jest.fn().mockResolvedValue(SUCCESSFUL_OPENAI_RESPONSE) as never;
    checkAndConsumeRateLimitFn = jest
      .fn()
      .mockResolvedValue({
        allowed: true,
        reservation: {
          authState: "guest",
          attemptId: "attempt-001",
        },
      });
    releaseRateLimitAttemptFn = jest.fn().mockResolvedValue(true);
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.restoreAllMocks();
  });

  function buildBaseFormData(
    overrides: Partial<{
      model: string;
      prompt: string;
      uploadImage: File;
      sourceImageType: string;
      backgroundMode: string;
      generationType: string;
    }> = {}
  ) {
    const fd = new FormData();
    fd.set("model", overrides.model ?? "gpt-image-2-low");
    fd.set("prompt", overrides.prompt ?? "ピンクのドレス");
    fd.set("uploadImage", overrides.uploadImage ?? createPngImage());
    fd.set("sourceImageType", overrides.sourceImageType ?? "illustration");
    fd.set("backgroundMode", overrides.backgroundMode ?? "keep");
    fd.set("generationType", overrides.generationType ?? "coordinate");
    return fd;
  }

  test("UCL-001 + UCL-003: 許可モデルで成功時に data URL を返し DB 保存しない", async () => {
    const fd = buildBaseFormData({ model: "gpt-image-2-low" });
    const response = await postCoordinateGenerateGuestRoute(createRequest(fd), {
      getUserFn,
      geminiApiKey: "gemini-key",
      openaiApiKey: "openai-key",
      fetchFn,
      openaiClient,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({
      imageDataUrl: "data:image/png;base64,RESULT_BASE64",
      mimeType: "image/png",
    });
    expect(openaiClient).toHaveBeenCalledTimes(1);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("UCL-001: Nano Banana 0.5K (Gemini) も成功する", async () => {
    const fd = buildBaseFormData({
      model: "gemini-3.1-flash-image-preview-512",
    });
    const response = await postCoordinateGenerateGuestRoute(createRequest(fd), {
      getUserFn,
      geminiApiKey: "gemini-key",
      openaiApiKey: "openai-key",
      fetchFn,
      openaiClient,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    expect(response.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(openaiClient).not.toHaveBeenCalled();
  });

  test("UCL-001: 許可外モデルは 400 で拒否する", async () => {
    const fd = buildBaseFormData({ model: "gemini-3-pro-image-1k" });
    const response = await postCoordinateGenerateGuestRoute(createRequest(fd), {
      getUserFn,
      geminiApiKey: "gemini-key",
      openaiApiKey: "openai-key",
      fetchFn,
      openaiClient,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("GUEST_MODEL_NOT_ALLOWED");
    // reserve に到達していない
    expect(checkAndConsumeRateLimitFn).not.toHaveBeenCalled();
  });

  test("UCL-014: 認証ユーザーは 403 + GUEST_ROUTE_AUTHENTICATED_FORBIDDEN", async () => {
    getUserFn.mockResolvedValueOnce({ id: "user-001" });
    const fd = buildBaseFormData();
    const response = await postCoordinateGenerateGuestRoute(createRequest(fd), {
      getUserFn,
      geminiApiKey: "gemini-key",
      openaiApiKey: "openai-key",
      fetchFn,
      openaiClient,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(403);
    expect(body.errorCode).toBe("GUEST_ROUTE_AUTHENTICATED_FORBIDDEN");
    // ガードは reserve 前なのでレートも upstream も呼ばない
    expect(checkAndConsumeRateLimitFn).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(openaiClient).not.toHaveBeenCalled();
  });

  test("UCL-014: provider key 未設定でも認証ユーザー拒否を先に返す", async () => {
    getUserFn.mockResolvedValueOnce({ id: "user-001" });
    const fd = buildBaseFormData();
    const response = await postCoordinateGenerateGuestRoute(createRequest(fd), {
      getUserFn,
      fetchFn,
      openaiClient,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(403);
    expect(body.errorCode).toBe("GUEST_ROUTE_AUTHENTICATED_FORBIDDEN");
    expect(checkAndConsumeRateLimitFn).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(openaiClient).not.toHaveBeenCalled();
  });

  test("UCL-011c: GIF を OpenAI に投げると reserve 前に 400 で拒否", async () => {
    const gif = new File([new Uint8Array(16)], "x.gif", { type: "image/gif" });
    const fd = buildBaseFormData({
      model: "gpt-image-2-low",
      uploadImage: gif,
    });
    const response = await postCoordinateGenerateGuestRoute(createRequest(fd), {
      getUserFn,
      geminiApiKey: "gemini-key",
      openaiApiKey: "openai-key",
      fetchFn,
      openaiClient,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("GUEST_INVALID_MODEL_FOR_IMAGE");
    expect(checkAndConsumeRateLimitFn).not.toHaveBeenCalled();
  });

  test("UCL-002: rate limit 上限超過時は 429 + signupCta", async () => {
    checkAndConsumeRateLimitFn.mockResolvedValueOnce({
      allowed: false,
      reason: "guest_daily",
    });
    const fd = buildBaseFormData();
    const response = await postCoordinateGenerateGuestRoute(createRequest(fd), {
      getUserFn,
      geminiApiKey: "gemini-key",
      openaiApiKey: "openai-key",
      fetchFn,
      openaiClient,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(429);
    expect(body).toEqual({
      error: expect.any(String),
      errorCode: "GUEST_RATE_LIMIT_DAILY",
      signupCta: true,
      signupPath: expect.stringContaining("/signup"),
    });
    expect(openaiClient).not.toHaveBeenCalled();
  });

  test("UCL-010: 識別子取得失敗時は 400", async () => {
    checkAndConsumeRateLimitFn.mockResolvedValueOnce({
      allowed: false,
      reason: "missing_identifier",
    });
    const fd = buildBaseFormData();
    const response = await postCoordinateGenerateGuestRoute(createRequest(fd), {
      getUserFn,
      geminiApiKey: "gemini-key",
      openaiApiKey: "openai-key",
      fetchFn,
      openaiClient,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("GUEST_IDENTIFIER_UNAVAILABLE");
  });

  test("UCL-011a: 上流タイムアウトは release", async () => {
    openaiClient.mockRejectedValueOnce(
      Object.assign(new Error("aborted"), { name: "AbortError" })
    );
    const fd = buildBaseFormData({ model: "gpt-image-2-low" });
    const response = await postCoordinateGenerateGuestRoute(createRequest(fd), {
      getUserFn,
      geminiApiKey: "gemini-key",
      openaiApiKey: "openai-key",
      fetchFn,
      openaiClient,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });

    expect(response.status).toBe(504);
    expect(releaseRateLimitAttemptFn).toHaveBeenCalledWith({
      reservation: { authState: "guest", attemptId: "attempt-001" },
      reason: "timeout",
    });
  });

  test("UCL-011b: safety/policy block は release しない (試行を消費)", async () => {
    openaiClient.mockRejectedValueOnce(new Error("safety_policy_blocked"));
    const fd = buildBaseFormData({ model: "gpt-image-2-low" });
    const response = await postCoordinateGenerateGuestRoute(createRequest(fd), {
      getUserFn,
      geminiApiKey: "gemini-key",
      openaiApiKey: "openai-key",
      fetchFn,
      openaiClient,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);

    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("GUEST_SAFETY_BLOCKED");
    expect(releaseRateLimitAttemptFn).not.toHaveBeenCalled();
  });

  test("UCL-011a: openai_provider_error も release", async () => {
    openaiClient.mockRejectedValueOnce(
      new Error("openai_provider_error: incorrect api key")
    );
    const fd = buildBaseFormData({ model: "gpt-image-2-low" });
    const response = await postCoordinateGenerateGuestRoute(createRequest(fd), {
      getUserFn,
      geminiApiKey: "gemini-key",
      openaiApiKey: "openai-key",
      fetchFn,
      openaiClient,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });

    expect(response.status).toBe(502);
    expect(releaseRateLimitAttemptFn).toHaveBeenCalledWith({
      reservation: { authState: "guest", attemptId: "attempt-001" },
      reason: "infra_error",
    });
  });

  test("prompt が空なら 400 GUEST_PROMPT_MISSING", async () => {
    const fd = buildBaseFormData({ prompt: "" });
    const response = await postCoordinateGenerateGuestRoute(createRequest(fd), {
      getUserFn,
      geminiApiKey: "gemini-key",
      openaiApiKey: "openai-key",
      fetchFn,
      openaiClient,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);
    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("GUEST_PROMPT_MISSING");
    expect(checkAndConsumeRateLimitFn).not.toHaveBeenCalled();
  });

  test("uploadImage が無いと 400 GUEST_IMAGE_MISSING", async () => {
    const fd = new FormData();
    fd.set("model", "gpt-image-2-low");
    fd.set("prompt", "ピンクのドレス");
    // uploadImage を意図的にセットしない
    const response = await postCoordinateGenerateGuestRoute(createRequest(fd), {
      getUserFn,
      geminiApiKey: "gemini-key",
      openaiApiKey: "openai-key",
      fetchFn,
      openaiClient,
      checkAndConsumeRateLimitFn,
      releaseRateLimitAttemptFn,
    });
    const body = await readJson(response);
    expect(response.status).toBe(400);
    expect(body.errorCode).toBe("GUEST_IMAGE_MISSING");
  });
});
