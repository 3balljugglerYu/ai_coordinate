/** @jest-environment node */

import type { NextRequest } from "next/server";
import { POST } from "@/app/api/generate/route";

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

async function readJson(response: Response): Promise<JsonRecord> {
  return (await response.json()) as JsonRecord;
}

describe("Characterization: GenerateRoute POST", () => {
  let originalFetch: typeof global.fetch;
  let fetchMock: jest.MockedFunction<typeof fetch>;
  let originalGeminiApiKey: string | undefined;
  let originalGoogleStudioApiKey: string | undefined;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    originalFetch = global.fetch;
    fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;

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
    global.fetch = originalFetch;

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

  test("CHAR-GENERATE-001: invalid schema returns 400 with first issue message", async () => {
    const response = await POST(createRequest({ prompt: "" }));
    const body = await readJson(response);

    expect({
      status: response.status,
      body,
    }).toMatchInlineSnapshot(`
      {
        "body": {
          "error": "着せ替え内容を入力してください",
        },
        "status": 400,
      }
    `);
  });

  test("CHAR-GENERATE-002: missing API key returns 500 before upstream call", async () => {
    const response = await POST(createRequest({ prompt: "black jacket" }));
    const body = await readJson(response);

    expect(fetchMock).not.toHaveBeenCalled();
    expect({
      status: response.status,
      body,
    }).toMatchInlineSnapshot(`
      {
        "body": {
          "error": "API key is not configured",
        },
        "status": 500,
      }
    `);
  });

  test("CHAR-GENERATE-003: success returns upstream payload and normalized model", async () => {
    process.env.GEMINI_API_KEY = "test-api-key";

    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: "image/png",
                    data: "base64-image-data",
                  },
                },
              ],
            },
            finishReason: "STOP",
          },
        ],
      })
    );

    const response = await POST(
      createRequest({
        prompt: "white shirt and navy slacks",
        count: 2,
      })
    );

    const body = await readJson(response);
    const [url, requestInit] = fetchMock.mock.calls[0] ?? [];
    const upstreamRequestBody = JSON.parse(
      String((requestInit as RequestInit)?.body)
    );

    expect({
      status: response.status,
      body,
      upstream: {
        url,
        method: (requestInit as RequestInit)?.method,
        headers: (requestInit as RequestInit)?.headers,
        body: upstreamRequestBody,
      },
    }).toMatchInlineSnapshot(`
      {
        "body": {
          "candidates": [
            {
              "content": {
                "parts": [
                  {
                    "inlineData": {
                      "data": "base64-image-data",
                      "mimeType": "image/png",
                    },
                  },
                ],
              },
              "finishReason": "STOP",
            },
          ],
          "model": "gemini-2.5-flash-image",
        },
        "status": 200,
        "upstream": {
          "body": {
            "contents": [
              {
                "parts": [
                  {
                    "text": "white shirt and navy slacks",
                  },
                ],
              },
            ],
            "generationConfig": {
              "candidateCount": 2,
            },
          },
          "headers": {
            "Content-Type": "application/json",
            "x-goog-api-key": "test-api-key",
          },
          "method": "POST",
          "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent",
        },
      }
    `);
  });

  test("CHAR-GENERATE-004: gemini-3-pro-image request includes imageConfig and preview endpoint", async () => {
    process.env.GEMINI_API_KEY = "test-api-key";

    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        candidates: [],
      })
    );

    const response = await POST(
      createRequest({
        prompt: "linen shirt",
        sourceImageBase64: "abc123",
        sourceImageMimeType: "image/png",
        sourceImageType: "real",
        backgroundMode: "ai_auto",
        generationType: "coordinate",
        count: 4,
        model: "gemini-3-pro-image-4k",
      })
    );

    const [url, requestInit] = fetchMock.mock.calls[0] ?? [];
    const upstreamRequestBody = JSON.parse(
      String((requestInit as RequestInit)?.body)
    );

    expect(response.status).toBe(200);
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent"
    );
    expect(upstreamRequestBody.generationConfig).toEqual({
      candidateCount: 4,
      imageConfig: {
        imageSize: "4K",
      },
    });
    expect(upstreamRequestBody.contents?.[0]?.parts?.[0]).toEqual({
      inline_data: {
        mime_type: "image/png",
        data: "abc123",
      },
    });
    expect(upstreamRequestBody.contents?.[0]?.parts?.[1]?.text).toContain(
      "Adjust the background to match the new outfit"
    );
  });

  test("CHAR-GENERATE-005: upstream non-OK status maps to localized and passthrough errors", async () => {
    process.env.GEMINI_API_KEY = "test-api-key";

    fetchMock
      .mockResolvedValueOnce(
        createJsonResponse(404, {
          error: {
            message: "upstream not found",
          },
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse(403, {
          error: {
            message: "forbidden",
          },
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse(429, {
          error: {
            message: "quota exceeded",
          },
        })
      );

    const notFound = await POST(
      createRequest({
        prompt: "test",
        model: "gemini-3-pro-image-preview",
      })
    );
    const forbidden = await POST(createRequest({ prompt: "test" }));
    const throttled = await POST(createRequest({ prompt: "test" }));

    expect({
      notFound: {
        status: notFound.status,
        body: await readJson(notFound),
      },
      forbidden: {
        status: forbidden.status,
        body: await readJson(forbidden),
      },
      throttled: {
        status: throttled.status,
        body: await readJson(throttled),
      },
    }).toMatchInlineSnapshot(`
      {
        "forbidden": {
          "body": {
            "error": "モデル \"gemini-2.5-flash-image\" が現在利用できません。しばらく待ってから再試行するか、別のモデルを選択してください。",
          },
          "status": 403,
        },
        "notFound": {
          "body": {
            "error": "モデル \"gemini-3-pro-image-2k\" が見つかりません。別のモデルを選択してください。",
          },
          "status": 404,
        },
        "throttled": {
          "body": {
            "error": "quota exceeded",
          },
          "status": 429,
        },
      }
    `);
  });

  test("CHAR-GENERATE-006: catches runtime failures and returns 500 with error message", async () => {
    process.env.GEMINI_API_KEY = "test-api-key";
    fetchMock.mockRejectedValueOnce(new Error("network offline"));

    const response = await POST(createRequest({ prompt: "test" }));
    const body = await readJson(response);

    expect({
      status: response.status,
      body,
    }).toMatchInlineSnapshot(`
      {
        "body": {
          "error": "network offline",
        },
        "status": 500,
      }
    `);
  });

  test("CHAR-GENERATE-007: upstream success with data.error uses provided code and message", async () => {
    process.env.GEMINI_API_KEY = "test-api-key";

    fetchMock.mockResolvedValueOnce(
      createJsonResponse(200, {
        error: {
          code: 418,
          message: "teapot",
          status: "INVALID_ARGUMENT",
        },
      })
    );

    const response = await POST(createRequest({ prompt: "test" }));
    const body = await readJson(response);

    expect({
      status: response.status,
      body,
    }).toMatchInlineSnapshot(`
      {
        "body": {
          "error": "teapot",
        },
        "status": 418,
      }
    `);
  });
});
