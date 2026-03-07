/** @jest-environment node */

import type { NextRequest } from "next/server";
import {
  POST,
  generateRouteHandlers,
  postGenerateRoute,
} from "@/app/api/generate/route";
import type { NanobananaClient } from "@/features/generation/lib/nanobanana-client";

type JsonRecord = Record<string, unknown>;

function createRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function createJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function createNanobananaClientMock(): jest.Mocked<NanobananaClient> {
  return {
    generateContent: jest.fn(),
  };
}

async function readJson(response: Response): Promise<JsonRecord> {
  return (await response.json()) as JsonRecord;
}

describe("GenerateRoute integration tests from EARS specs", () => {
  let originalGeminiApiKey: string | undefined;
  let originalGoogleStudioApiKey: string | undefined;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    originalGeminiApiKey = process.env.GEMINI_API_KEY;
    originalGoogleStudioApiKey = process.env.GOOGLE_AI_STUDIO_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_AI_STUDIO_API_KEY;

    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {
      // keep test output deterministic
    });
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {
      // keep test output deterministic
    });
  });

  afterEach(() => {
    if (originalGeminiApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalGeminiApiKey;
    }

    if (originalGoogleStudioApiKey === undefined) {
      delete process.env.GOOGLE_AI_STUDIO_API_KEY;
    } else {
      process.env.GOOGLE_AI_STUDIO_API_KEY = originalGoogleStudioApiKey;
    }

    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
    jest.restoreAllMocks();
  });

  describe("GENRT-001 postGenerateRoute", () => {
    test("postGenerateRoute_有効リクエストとAPIキーがある場合_200と正規化modelを返す", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      process.env.GEMINI_API_KEY = "gemini-priority-key";
      process.env.GOOGLE_AI_STUDIO_API_KEY = "google-fallback-key";

      const nanobananaClient = createNanobananaClientMock();
      nanobananaClient.generateContent.mockResolvedValueOnce(
        createJsonResponse(200, {
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: "image/png",
                      data: "image-base64",
                    },
                  },
                ],
              },
            },
          ],
        })
      );

      // ============================================================
      // Act
      // ============================================================
      const response = await postGenerateRoute(
        createRequest({
          prompt: "black jacket",
        }),
        { nanobananaClient }
      );
      const body = await readJson(response);

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(200);
      expect(body.model).toBe("gemini-2.5-flash-image");

      const call = nanobananaClient.generateContent.mock.calls[0]?.[0];
      expect(call).toBeDefined();
      if (!call) {
        throw new Error("nanobananaClient.generateContent was not called");
      }

      expect(call.apiKey).toBe("gemini-priority-key");
      expect(call.model).toBe("gemini-2.5-flash-image");
      expect(call.body.generationConfig?.candidateCount).toBeUndefined();
    });
  });

  describe("GENRT-002 postGenerateRoute", () => {
    test("postGenerateRoute_不正スキーマの場合_400と先頭バリデーションメッセージを返す", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      const nanobananaClient = createNanobananaClientMock();

      // ============================================================
      // Act
      // ============================================================
      const response = await postGenerateRoute(
        createRequest({
          prompt: "",
        }),
        { nanobananaClient }
      );
      const body = await readJson(response);

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(400);
      expect(body.error).toBe("着せ替え内容を入力してください");
      expect(nanobananaClient.generateContent).not.toHaveBeenCalled();
    });
  });

  describe("GENRT-003 postGenerateRoute", () => {
    test("postGenerateRoute_APIキー未設定の場合_クライアント未呼び出しで500を返す", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      const nanobananaClient = createNanobananaClientMock();

      // ============================================================
      // Act
      // ============================================================
      const response = await postGenerateRoute(
        createRequest({
          prompt: "black jacket",
        }),
        { nanobananaClient }
      );
      const body = await readJson(response);

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(500);
      expect(body.error).toBe("API key is not configured");
      expect(nanobananaClient.generateContent).not.toHaveBeenCalled();
    });
  });

  describe("GENRT-004 postGenerateRoute", () => {
    test("postGenerateRoute_元画像ありの場合_inline_dataとテンプレートプロンプトを送る", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      process.env.GEMINI_API_KEY = "test-api-key";
      const nanobananaClient = createNanobananaClientMock();
      nanobananaClient.generateContent.mockResolvedValueOnce(
        createJsonResponse(200, { candidates: [] })
      );

      // ============================================================
      // Act
      // ============================================================
      const response = await postGenerateRoute(
        createRequest({
          prompt: "white shirt",
          sourceImageBase64: "base64-source",
          sourceImageMimeType: "image/png",
          sourceImageType: "real",
          backgroundMode: "ai_auto",
          generationType: "coordinate",
        }),
        { nanobananaClient }
      );

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(200);
      const call = nanobananaClient.generateContent.mock.calls[0]?.[0];
      expect(call).toBeDefined();
      if (!call) {
        throw new Error("nanobananaClient.generateContent was not called");
      }

      expect(call.body.contents[0]?.parts[0]).toEqual({
        inline_data: {
          mime_type: "image/png",
          data: "base64-source",
        },
      });
      expect(call.body.contents[0]?.parts[1]?.text).toContain(
        "Adjust the background to match the new outfit"
      );
    });
  });

  describe("GENRT-005 postGenerateRoute", () => {
    test("postGenerateRoute_countが2以上の場合_candidateCountを4上限で設定する", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      process.env.GEMINI_API_KEY = "test-api-key";
      const nanobananaClient = createNanobananaClientMock();
      nanobananaClient.generateContent.mockResolvedValueOnce(
        createJsonResponse(200, { candidates: [] })
      );

      // ============================================================
      // Act
      // ============================================================
      const response = await postGenerateRoute(
        createRequest({
          prompt: "white shirt",
          count: 4,
        }),
        { nanobananaClient }
      );

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(200);
      const call = nanobananaClient.generateContent.mock.calls[0]?.[0];
      expect(call).toBeDefined();
      if (!call) {
        throw new Error("nanobananaClient.generateContent was not called");
      }
      expect(call.body.generationConfig?.candidateCount).toBe(4);
    });
  });

  describe("GENRT-006 postGenerateRoute", () => {
    test("postGenerateRoute_gemini3proモデルの場合_imageSizeとpreviewエンドポイントを使う", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      process.env.GEMINI_API_KEY = "test-api-key";
      const nanobananaClient = createNanobananaClientMock();
      nanobananaClient.generateContent.mockResolvedValueOnce(
        createJsonResponse(200, { candidates: [] })
      );

      // ============================================================
      // Act
      // ============================================================
      const response = await postGenerateRoute(
        createRequest({
          prompt: "white shirt",
          model: "gemini-3-pro-image-4k",
        }),
        { nanobananaClient }
      );

      // ============================================================
      // Assert
      // ============================================================
      expect(response.status).toBe(200);
      const call = nanobananaClient.generateContent.mock.calls[0]?.[0];
      expect(call).toBeDefined();
      if (!call) {
        throw new Error("nanobananaClient.generateContent was not called");
      }

      expect(call.model).toBe("gemini-3-pro-image-preview");
      expect(call.body.generationConfig?.imageConfig?.imageSize).toBe("4K");
    });
  });

  describe("GENRT-007 postGenerateRoute", () => {
    test("postGenerateRoute_upstream404の場合_モデル未検出メッセージを返す", async () => {
      process.env.GEMINI_API_KEY = "test-api-key";
      const nanobananaClient = createNanobananaClientMock();
      nanobananaClient.generateContent.mockResolvedValueOnce(
        createJsonResponse(404, { error: { message: "not found" } })
      );

      const response = await postGenerateRoute(
        createRequest({
          prompt: "white shirt",
          model: "gemini-3-pro-image-preview",
        }),
        { nanobananaClient }
      );
      const body = await readJson(response);

      expect(response.status).toBe(404);
      expect(body.error).toBe(
        'モデル "gemini-3-pro-image-2k" が見つかりません。別のモデルを選択してください。'
      );
    });

    test("postGenerateRoute_upstream403または503の場合_モデル利用不可メッセージを返す", async () => {
      process.env.GEMINI_API_KEY = "test-api-key";
      const nanobananaClient = createNanobananaClientMock();
      nanobananaClient.generateContent
        .mockResolvedValueOnce(createJsonResponse(403, { error: { message: "forbidden" } }))
        .mockResolvedValueOnce(createJsonResponse(503, { error: { message: "service unavailable" } }));

      const forbidden = await postGenerateRoute(
        createRequest({ prompt: "white shirt" }),
        { nanobananaClient }
      );
      const unavailable = await postGenerateRoute(
        createRequest({ prompt: "white shirt" }),
        { nanobananaClient }
      );

      expect(forbidden.status).toBe(403);
      expect(unavailable.status).toBe(503);
      expect((await readJson(forbidden)).error).toBe(
        'モデル "gemini-2.5-flash-image" が現在利用できません。しばらく待ってから再試行するか、別のモデルを選択してください。'
      );
      expect((await readJson(unavailable)).error).toBe(
        'モデル "gemini-2.5-flash-image" が現在利用できません。しばらく待ってから再試行するか、別のモデルを選択してください。'
      );
    });

    test("postGenerateRoute_upstreamその他エラーの場合_upstreamメッセージを返す", async () => {
      process.env.GEMINI_API_KEY = "test-api-key";
      const nanobananaClient = createNanobananaClientMock();
      nanobananaClient.generateContent.mockResolvedValueOnce(
        createJsonResponse(429, { error: { message: "quota exceeded" } })
      );

      const response = await postGenerateRoute(
        createRequest({ prompt: "white shirt" }),
        { nanobananaClient }
      );
      const body = await readJson(response);

      expect(response.status).toBe(429);
      expect(body.error).toBe("quota exceeded");
    });
  });

  describe("GENRT-008 postGenerateRoute", () => {
    test("postGenerateRoute_成功ペイロード内にdata.errorがある場合_エラーコードとメッセージを返す", async () => {
      process.env.GEMINI_API_KEY = "test-api-key";
      const nanobananaClient = createNanobananaClientMock();
      nanobananaClient.generateContent.mockResolvedValueOnce(
        createJsonResponse(200, {
          error: {
            code: 418,
            message: "teapot",
            status: "INVALID_ARGUMENT",
          },
        })
      );

      const response = await postGenerateRoute(
        createRequest({ prompt: "white shirt" }),
        { nanobananaClient }
      );
      const body = await readJson(response);

      expect(response.status).toBe(418);
      expect(body.error).toBe("teapot");
    });

    test("postGenerateRoute_data.errorのコードや文言が欠ける場合_500とフォールバック文言を返す", async () => {
      process.env.GEMINI_API_KEY = "test-api-key";
      const nanobananaClient = createNanobananaClientMock();
      nanobananaClient.generateContent.mockResolvedValueOnce(
        createJsonResponse(200, {
          error: {
            status: "UNKNOWN",
            message: "",
          },
        })
      );

      const response = await postGenerateRoute(
        createRequest({ prompt: "white shirt" }),
        { nanobananaClient }
      );
      const body = await readJson(response);

      expect(response.status).toBe(500);
      expect(body.error).toBe("Failed to generate image");
    });
  });

  describe("GENRT-009 postGenerateRoute", () => {
    test("postGenerateRoute_実行時例外の場合_500と例外メッセージを返す", async () => {
      process.env.GEMINI_API_KEY = "test-api-key";
      const nanobananaClient = createNanobananaClientMock();
      nanobananaClient.generateContent.mockRejectedValueOnce(
        new Error("network offline")
      );

      const response = await postGenerateRoute(
        createRequest({ prompt: "white shirt" }),
        { nanobananaClient }
      );
      const body = await readJson(response);

      expect(response.status).toBe(500);
      expect(body.error).toBe("network offline");
    });

    test("postGenerateRoute_Error以外がthrowされた場合_500とInternalServerErrorを返す", async () => {
      process.env.GEMINI_API_KEY = "test-api-key";
      const nanobananaClient = createNanobananaClientMock();
      nanobananaClient.generateContent.mockRejectedValueOnce("unexpected throw");

      const response = await postGenerateRoute(
        createRequest({ prompt: "white shirt" }),
        { nanobananaClient }
      );
      const body = await readJson(response);

      expect(response.status).toBe(500);
      expect(body.error).toBe("Internal server error");
    });
  });

  describe("GENRT-010 POST", () => {
    test("POST_有効リクエストの場合_postGenerateRouteに委譲する", async () => {
      // ============================================================
      // Arrange
      // ============================================================
      // Spec: GENRT-010
      const invalidPayload = { prompt: "" };
      const request = createRequest(invalidPayload);
      const delegateSpy = jest.spyOn(generateRouteHandlers, "postGenerateRoute");

      // ============================================================
      // Act
      // ============================================================
      await POST(request);

      // ============================================================
      // Assert
      // ============================================================
      expect(delegateSpy).toHaveBeenCalledTimes(1);
      expect(delegateSpy).toHaveBeenCalledWith(request);
      delegateSpy.mockRestore();
    });
  });
});
