/** @jest-environment node */

import {
  GUEST_AUTH_FORBIDDEN,
  assertGuestRequest,
  dispatchGuestImageGeneration,
  parseGuestModelInput,
  shouldReleaseReservationFor,
  validateGuestImageInput,
  type DispatchGuestImageGenerationResult,
} from "@/features/generation/lib/guest-generate";

const COPY = {
  invalidImageMessage: "invalid image",
  imageTooLargeMessage: "image too large",
  gifNotSupportedByOpenAIMessage: "gif not supported",
};

function createPngFile(name = "input.png"): File {
  return new File([new Uint8Array(16)], name, { type: "image/png" });
}

describe("guest-generate", () => {
  describe("assertGuestRequest", () => {
    test("user が null なら guest 通過", () => {
      expect(assertGuestRequest(null)).toEqual({ kind: "guest" });
    });
    test("user が non-null なら auth_forbidden", () => {
      expect(assertGuestRequest({ id: "user-1" })).toEqual(
        GUEST_AUTH_FORBIDDEN
      );
      expect(GUEST_AUTH_FORBIDDEN.errorCode).toBe(
        "GUEST_ROUTE_AUTHENTICATED_FORBIDDEN"
      );
    });
  });

  describe("parseGuestModelInput", () => {
    test("許可モデルは canonical を返す", () => {
      expect(parseGuestModelInput("gpt-image-2-low")).toBe("gpt-image-2-low");
      expect(
        parseGuestModelInput("gemini-3.1-flash-image-preview-512")
      ).toBe("gemini-3.1-flash-image-preview-512");
    });

    test("許可外モデル / 未知 / null は null", () => {
      expect(parseGuestModelInput("gemini-3-pro-image-1k")).toBeNull();
      expect(parseGuestModelInput("dall-e-3")).toBeNull();
      expect(parseGuestModelInput(null)).toBeNull();
    });
  });

  describe("validateGuestImageInput", () => {
    test("PNG + 許可モデルは ok", () => {
      const result = validateGuestImageInput({
        uploadImage: createPngFile(),
        model: "gpt-image-2-low",
        ...COPY,
      });
      expect(result.kind).toBe("ok");
    });

    test("GIF を OpenAI に投げようとしたら GUEST_INVALID_MODEL_FOR_IMAGE", () => {
      const gif = new File([new Uint8Array(16)], "x.gif", { type: "image/gif" });
      const result = validateGuestImageInput({
        uploadImage: gif,
        model: "gpt-image-2-low",
        ...COPY,
      });
      expect(result).toEqual({
        kind: "input_error",
        errorCode: "GUEST_INVALID_MODEL_FOR_IMAGE",
        message: COPY.gifNotSupportedByOpenAIMessage,
      });
    });

    test("GIF を Gemini に投げるのは ok", () => {
      const gif = new File([new Uint8Array(16)], "x.gif", { type: "image/gif" });
      const result = validateGuestImageInput({
        uploadImage: gif,
        model: "gemini-3.1-flash-image-preview-512",
        ...COPY,
      });
      expect(result.kind).toBe("ok");
    });

    test("未対応 MIME は GUEST_INVALID_IMAGE", () => {
      const svg = new File([new Uint8Array(8)], "x.svg", {
        type: "image/svg+xml",
      });
      const result = validateGuestImageInput({
        uploadImage: svg,
        model: "gemini-3.1-flash-image-preview-512",
        ...COPY,
      });
      expect(result).toEqual({
        kind: "input_error",
        errorCode: "GUEST_INVALID_IMAGE",
        message: COPY.invalidImageMessage,
      });
    });

    test("10MB 超は GUEST_INVALID_IMAGE", () => {
      const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.png", {
        type: "image/png",
      });
      const result = validateGuestImageInput({
        uploadImage: big,
        model: "gemini-3.1-flash-image-preview-512",
        ...COPY,
      });
      expect(result).toEqual({
        kind: "input_error",
        errorCode: "GUEST_INVALID_IMAGE",
        message: COPY.imageTooLargeMessage,
      });
    });
  });

  describe("shouldReleaseReservationFor (UCL-011a/b)", () => {
    test("timeout / openai_provider_error / no_image / 5xx upstream は release", () => {
      expect(shouldReleaseReservationFor({ kind: "timeout" })).toBe(true);
      expect(
        shouldReleaseReservationFor({
          kind: "openai_provider_error",
          message: "x",
        })
      ).toBe(true);
      expect(
        shouldReleaseReservationFor({
          kind: "no_image",
          finishReasons: ["STOP"],
          retryable: false,
        })
      ).toBe(true);
      expect(
        shouldReleaseReservationFor({
          kind: "upstream_error",
          message: "5xx",
          status: 503,
        })
      ).toBe(true);
    });

    test("4xx upstream は release しない (ユーザー側起因なので消費する)", () => {
      expect(
        shouldReleaseReservationFor({
          kind: "upstream_error",
          message: "bad request",
          status: 400,
        })
      ).toBe(false);
    });

    test("safety_blocked / user_input_error / success は release しない", () => {
      expect(shouldReleaseReservationFor({ kind: "safety_blocked" })).toBe(
        false
      );
      expect(
        shouldReleaseReservationFor({
          kind: "user_input_error",
          message: "x",
        })
      ).toBe(false);
      expect(
        shouldReleaseReservationFor({
          kind: "success",
          imageDataUrl: "data:image/png;base64,xxx",
          mimeType: "image/png",
        })
      ).toBe(false);
    });
  });

  describe("dispatchGuestImageGeneration (Gemini path)", () => {
    test("成功時は data URL を返す", async () => {
      const fetchFn = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      inline_data: {
                        mime_type: "image/png",
                        data: "BASE64_OK",
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
      const result = await dispatchGuestImageGeneration({
        model: "gemini-3.1-flash-image-preview-512",
        promptText: "hello",
        uploadImage: createPngFile(),
        geminiApiKey: "key",
        fetchFn: fetchFn as unknown as typeof fetch,
      });
      expect(result).toEqual({
        kind: "success",
        imageDataUrl: "data:image/png;base64,BASE64_OK",
        mimeType: "image/png",
      });
      expect(fetchFn).toHaveBeenCalledWith(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent",
        expect.objectContaining({ method: "POST" })
      );
    });

    test("safety/policy エラーレスポンスは safety_blocked", async () => {
      const fetchFn = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { message: "blocked by safety policy" } }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      );
      const result = await dispatchGuestImageGeneration({
        model: "gemini-3.1-flash-image-preview-512",
        promptText: "x",
        uploadImage: createPngFile(),
        geminiApiKey: "key",
        fetchFn: fetchFn as unknown as typeof fetch,
      });
      expect(result.kind).toBe("safety_blocked");
    });

    test("MALFORMED_FUNCTION_CALL の no_image は retryable=true", async () => {
      const fetchFn = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: { parts: [{ text: "no image" }] },
                finishReason: "MALFORMED_FUNCTION_CALL",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
      const result = await dispatchGuestImageGeneration({
        model: "gemini-3.1-flash-image-preview-512",
        promptText: "x",
        uploadImage: createPngFile(),
        geminiApiKey: "key",
        fetchFn: fetchFn as unknown as typeof fetch,
      });
      expect(result).toMatchObject({ kind: "no_image", retryable: true });
    });

    test("STOP の no_image は retryable=false", async () => {
      const fetchFn = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: { parts: [{ text: "no image" }] },
                finishReason: "STOP",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
      const result = await dispatchGuestImageGeneration({
        model: "gemini-3.1-flash-image-preview-512",
        promptText: "x",
        uploadImage: createPngFile(),
        geminiApiKey: "key",
        fetchFn: fetchFn as unknown as typeof fetch,
      });
      expect(result).toMatchObject({ kind: "no_image", retryable: false });
    });

    test("AbortError は timeout", async () => {
      const fetchFn = jest.fn().mockRejectedValue(
        Object.assign(new Error("aborted"), { name: "AbortError" })
      );
      const result = await dispatchGuestImageGeneration({
        model: "gemini-3.1-flash-image-preview-512",
        promptText: "x",
        uploadImage: createPngFile(),
        geminiApiKey: "key",
        fetchFn: fetchFn as unknown as typeof fetch,
      });
      expect(result.kind).toBe("timeout");
    });

    test("HTTP 503 は upstream_error (status=503)", async () => {
      const fetchFn = jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "overloaded" } }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })
      );
      const result = (await dispatchGuestImageGeneration({
        model: "gemini-3.1-flash-image-preview-512",
        promptText: "x",
        uploadImage: createPngFile(),
        geminiApiKey: "key",
        fetchFn: fetchFn as unknown as typeof fetch,
      })) as Extract<DispatchGuestImageGenerationResult, { kind: "upstream_error" }>;
      expect(result.kind).toBe("upstream_error");
      expect(result.status).toBe(503);
    });
  });

  describe("dispatchGuestImageGeneration (OpenAI path)", () => {
    test("openaiClient で成功時は data URL を返す", async () => {
      const openaiClient = jest.fn().mockResolvedValue({
        data: "OPENAI_BASE64",
        mimeType: "image/png",
      });
      const result = await dispatchGuestImageGeneration({
        model: "gpt-image-2-low",
        promptText: "x",
        uploadImage: createPngFile(),
        geminiApiKey: "(unused)",
        openaiApiKey: "openai-key",
        openaiClient,
      });
      expect(result).toEqual({
        kind: "success",
        imageDataUrl: "data:image/png;base64,OPENAI_BASE64",
        mimeType: "image/png",
      });
      expect(openaiClient).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: "openai-key" })
      );
    });

    test("openaiClient が SAFETY エラーを throw すると safety_blocked", async () => {
      const openaiClient = jest.fn().mockRejectedValue(
        new Error("safety_policy_blocked")
      );
      const result = await dispatchGuestImageGeneration({
        model: "gpt-image-2-low",
        promptText: "x",
        uploadImage: createPngFile(),
        geminiApiKey: "(unused)",
        openaiApiKey: "openai-key",
        openaiClient,
      });
      expect(result.kind).toBe("safety_blocked");
    });

    test("OPENAI_PROVIDER_ERROR は openai_provider_error", async () => {
      const openaiClient = jest.fn().mockRejectedValue(
        new Error("openai_provider_error: incorrect api key")
      );
      const result = (await dispatchGuestImageGeneration({
        model: "gpt-image-2-low",
        promptText: "x",
        uploadImage: createPngFile(),
        geminiApiKey: "(unused)",
        openaiApiKey: "openai-key",
        openaiClient,
      })) as Extract<DispatchGuestImageGenerationResult, { kind: "openai_provider_error" }>;
      expect(result.kind).toBe("openai_provider_error");
      expect(result.message).toMatch(/incorrect api key/);
    });

    test("'No images generated' は no_image (retryable=false)", async () => {
      const openaiClient = jest.fn().mockRejectedValue(
        new Error("No images generated")
      );
      const result = await dispatchGuestImageGeneration({
        model: "gpt-image-2-low",
        promptText: "x",
        uploadImage: createPngFile(),
        geminiApiKey: "(unused)",
        openaiApiKey: "openai-key",
        openaiClient,
      });
      expect(result).toMatchObject({ kind: "no_image", retryable: false });
    });

    test("AbortError は timeout", async () => {
      const openaiClient = jest.fn().mockRejectedValue(
        Object.assign(new Error("aborted"), { name: "AbortError" })
      );
      const result = await dispatchGuestImageGeneration({
        model: "gpt-image-2-low",
        promptText: "x",
        uploadImage: createPngFile(),
        geminiApiKey: "(unused)",
        openaiApiKey: "openai-key",
        openaiClient,
      });
      expect(result.kind).toBe("timeout");
    });
  });
});
