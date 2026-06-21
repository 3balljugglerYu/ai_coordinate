/** @jest-environment node */

import {
  GUEST_ALLOWED_MODELS,
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
    test("Gemini 停止中の許可モデル (OpenAI) は canonical を返す", () => {
      expect(parseGuestModelInput("gpt-image-2-low-1k")).toBe("gpt-image-2-low-1k");
    });

    test("legacy GPT Image 2 low は 1k canonical に正規化する", () => {
      expect(parseGuestModelInput("gpt-image-2-low")).toBe(
        "gpt-image-2-low-1k"
      );
    });

    test("停止中の Gemini / 許可外モデル / 未知 / null は null", () => {
      expect(
        parseGuestModelInput("gemini-3.1-flash-image-preview-512")
      ).toBeNull();
      expect(parseGuestModelInput("gemini-3-pro-image-1k")).toBeNull();
      expect(parseGuestModelInput("dall-e-3")).toBeNull();
      expect(parseGuestModelInput(null)).toBeNull();
    });
  });

  describe("validateGuestImageInput", () => {
    test("PNG + 許可モデルは ok", () => {
      const result = validateGuestImageInput({
        uploadImage: createPngFile(),
        model: "gpt-image-2-low-1k",
        ...COPY,
      });
      expect(result.kind).toBe("ok");
    });

    test("GIF を OpenAI に投げようとしたら GUEST_INVALID_MODEL_FOR_IMAGE", () => {
      const gif = new File([new Uint8Array(16)], "x.gif", { type: "image/gif" });
      const result = validateGuestImageInput({
        uploadImage: gif,
        model: "gpt-image-2-low-1k",
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

      // Gemini request body の imageConfig には imageSize と aspectRatio が併置される。
      // 16 byte の zero buffer は parseImageDimensions が null を返すため、
      // resolveGeminiAspectRatio フォールバックで "1:1" になる。
      const requestBody = JSON.parse(
        String(fetchFn.mock.calls[0][1].body),
      ) as {
        generationConfig: {
          imageConfig?: { imageSize?: string; aspectRatio?: string };
        };
      };
      expect(requestBody.generationConfig.imageConfig).toEqual({
        imageSize: "512",
        aspectRatio: "1:1",
      });
    });

    test("referenceImage 指定時は Gemini に image_0 と image_1 を送る", async () => {
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
      const referenceBytes = new Uint8Array([1, 2, 3]);

      await dispatchGuestImageGeneration({
        model: "gemini-3.1-flash-image-preview-512",
        promptText: "hello",
        uploadImage: createPngFile(),
        referenceImage: new File([referenceBytes], "reference.webp", {
          type: "image/webp",
        }),
        geminiApiKey: "key",
        fetchFn: fetchFn as unknown as typeof fetch,
      });

      const requestBody = JSON.parse(
        String(fetchFn.mock.calls[0][1].body),
      ) as {
        contents: Array<{ parts: Array<Record<string, unknown>> }>;
      };
      expect(requestBody.contents[0].parts).toHaveLength(3);
      expect(requestBody.contents[0].parts[1]).toEqual({
        inline_data: {
          mime_type: "image/png",
          data: Buffer.alloc(16).toString("base64"),
        },
      });
      expect(requestBody.contents[0].parts[2]).toEqual({
        inline_data: {
          mime_type: "image/webp",
          data: Buffer.from(referenceBytes).toString("base64"),
        },
      });
    });

    test("outputAspectRatioMode=square は Gemini aspectRatio を 1:1 に固定する", async () => {
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

      await dispatchGuestImageGeneration({
        model: "gemini-3.1-flash-image-preview-512",
        promptText: "hello",
        uploadImage: new File([createPngHeader(1600, 900)], "wide.png", {
          type: "image/png",
        }),
        outputAspectRatioMode: "1:1",
        geminiApiKey: "key",
        fetchFn: fetchFn as unknown as typeof fetch,
      });

      const requestBody = JSON.parse(
        String(fetchFn.mock.calls[0][1].body),
      ) as {
        generationConfig: {
          imageConfig?: { imageSize?: string; aspectRatio?: string };
        };
      };
      expect(requestBody.generationConfig.imageConfig).toEqual({
        imageSize: "512",
        aspectRatio: "1:1",
      });
    });

    test("imageSize を持たない Gemini モデル (gemini-2.5-flash-image) でも aspectRatio は送られる", async () => {
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
      await dispatchGuestImageGeneration({
        // GUEST_ALLOWED_MODELS には含まれないが extractImageSize が null を返す
        // 経路の network request body 検証用 (本番では別の guard で弾かれる想定)。
        model: "gemini-2.5-flash-image" as unknown as Parameters<
          typeof dispatchGuestImageGeneration
        >[0]["model"],
        promptText: "hello",
        uploadImage: createPngFile(),
        geminiApiKey: "key",
        fetchFn: fetchFn as unknown as typeof fetch,
      });
      const requestBody = JSON.parse(
        String(fetchFn.mock.calls[0][1].body),
      ) as {
        generationConfig: {
          imageConfig?: { imageSize?: string; aspectRatio?: string };
        };
      };
      // imageSize は含まれず、aspectRatio のみが送られること
      expect(requestBody.generationConfig.imageConfig).toEqual({
        aspectRatio: "1:1",
      });
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

    test("JSON として読めない成功レスポンスは no_image (finishReasons=[]) にする", async () => {
      const fetchFn = jest.fn().mockResolvedValue(
        new Response("not json", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
      const result = await dispatchGuestImageGeneration({
        model: "gemini-3.1-flash-image-preview-512",
        promptText: "x",
        uploadImage: createPngFile(),
        geminiApiKey: "key",
        fetchFn: fetchFn as unknown as typeof fetch,
      });
      expect(result).toEqual({
        kind: "no_image",
        finishReasons: [],
        retryable: false,
      });
    });

    test("promptFeedback.blockReason を含む成功レスポンスは safety_blocked", async () => {
      const fetchFn = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            promptFeedback: { blockReason: "SAFETY" },
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
      expect(result.kind).toBe("safety_blocked");
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

    test("fetch の AbortError 以外の失敗は upstream_error", async () => {
      const fetchFn = jest.fn().mockRejectedValue(new Error("network down"));
      const result = (await dispatchGuestImageGeneration({
        model: "gemini-3.1-flash-image-preview-512",
        promptText: "x",
        uploadImage: createPngFile(),
        geminiApiKey: "key",
        fetchFn: fetchFn as unknown as typeof fetch,
      })) as Extract<DispatchGuestImageGenerationResult, { kind: "upstream_error" }>;
      expect(result).toEqual({
        kind: "upstream_error",
        message: "network down",
        status: 502,
      });
    });

    test("HTTP エラーで JSON を読めない場合は fallback message の upstream_error", async () => {
      const fetchFn = jest.fn().mockResolvedValue(
        new Response("not json", {
          status: 502,
          headers: { "Content-Type": "text/plain" },
        })
      );
      const result = (await dispatchGuestImageGeneration({
        model: "gemini-3.1-flash-image-preview-512",
        promptText: "x",
        uploadImage: createPngFile(),
        geminiApiKey: "key",
        fetchFn: fetchFn as unknown as typeof fetch,
      })) as Extract<DispatchGuestImageGenerationResult, { kind: "upstream_error" }>;
      expect(result).toEqual({
        kind: "upstream_error",
        message: "Gemini API request failed (HTTP 502)",
        status: 502,
      });
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
        model: "gpt-image-2-low-1k",
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
        expect.objectContaining({
          apiKey: "openai-key",
          quality: "low",
          sizeTier: "1k",
        })
      );
    });

    test("referenceImage 指定時は OpenAI multi-input に image_0 と image_1 を送る", async () => {
      const openaiClient = jest.fn();
      const openaiMultiInputClient = jest.fn().mockResolvedValue([
        {
          data: "OPENAI_BASE64",
          mimeType: "image/png",
        },
      ]);
      const referenceBytes = new Uint8Array([1, 2, 3]);

      const result = await dispatchGuestImageGeneration({
        model: "gpt-image-2-low-1k",
        promptText: "x",
        uploadImage: createPngFile(),
        referenceImage: new File([referenceBytes], "reference.webp", {
          type: "image/webp",
        }),
        geminiApiKey: "(unused)",
        openaiApiKey: "openai-key",
        openaiClient,
        openaiMultiInputClient,
      });

      expect(result).toEqual({
        kind: "success",
        imageDataUrl: "data:image/png;base64,OPENAI_BASE64",
        mimeType: "image/png",
      });
      expect(openaiClient).not.toHaveBeenCalled();
      expect(openaiMultiInputClient).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: "x",
          inputImages: [
            {
              base64: Buffer.alloc(16).toString("base64"),
              mimeType: "image/png",
            },
            {
              base64: Buffer.from(referenceBytes).toString("base64"),
              mimeType: "image/webp",
            },
          ],
          targetSizeBaseIndex: 0,
          apiKey: "openai-key",
          quality: "low",
          sizeTier: "1k",
          n: 1,
        })
      );
    });

    test("outputAspectRatioMode=square は OpenAI targetSize を正方形に固定する", async () => {
      const openaiClient = jest.fn().mockResolvedValue({
        data: "OPENAI_BASE64",
        mimeType: "image/png",
      });

      await dispatchGuestImageGeneration({
        model: "gpt-image-2-low-1k",
        promptText: "x",
        uploadImage: new File([createPngHeader(1600, 900)], "wide.png", {
          type: "image/png",
        }),
        outputAspectRatioMode: "1:1",
        geminiApiKey: "(unused)",
        openaiApiKey: "openai-key",
        openaiClient,
      });

      expect(openaiClient).toHaveBeenCalledWith(
        expect.objectContaining({
          targetSize: "1248x1248",
        })
      );
    });

    test("outputAspectRatioMode=16:9 は OpenAI でも横長 targetSize になる(入力1:1でも)", async () => {
      const openaiClient = jest.fn().mockResolvedValue({
        data: "OPENAI_BASE64",
        mimeType: "image/png",
      });

      await dispatchGuestImageGeneration({
        model: "gpt-image-2-low-1k",
        promptText: "x",
        // 入力は正方形だが、明示 16:9 なので出力は横長になるべき
        uploadImage: new File([createPngHeader(1024, 1024)], "sq.png", {
          type: "image/png",
        }),
        outputAspectRatioMode: "16:9",
        geminiApiKey: "(unused)",
        openaiApiKey: "openai-key",
        openaiClient,
      });

      const call = openaiClient.mock.calls[0][0] as { targetSize: string };
      const [w, h] = call.targetSize.split("x").map(Number);
      expect(w).toBeGreaterThan(h); // 横長
    });

    test("openaiClient が SAFETY エラーを throw すると safety_blocked", async () => {
      const openaiClient = jest.fn().mockRejectedValue(
        new Error("safety_policy_blocked")
      );
      const result = await dispatchGuestImageGeneration({
        model: "gpt-image-2-low-1k",
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
        model: "gpt-image-2-low-1k",
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
        model: "gpt-image-2-low-1k",
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
        model: "gpt-image-2-low-1k",
        promptText: "x",
        uploadImage: createPngFile(),
        geminiApiKey: "(unused)",
        openaiApiKey: "openai-key",
        openaiClient,
      });
      expect(result.kind).toBe("timeout");
    });

    test("openaiClient の一般エラーは upstream_error", async () => {
      const openaiClient = jest.fn().mockRejectedValue(new Error("server busy"));
      const result = (await dispatchGuestImageGeneration({
        model: "gpt-image-2-low-1k",
        promptText: "x",
        uploadImage: createPngFile(),
        geminiApiKey: "(unused)",
        openaiApiKey: "openai-key",
        openaiClient,
      })) as Extract<DispatchGuestImageGenerationResult, { kind: "upstream_error" }>;
      expect(result).toEqual({
        kind: "upstream_error",
        message: "server busy",
        status: 502,
      });
    });

    test("parseGptImage2Model が null になる無効モデルは openai_provider_error", async () => {
      // OpenAI 経路は model の suffix 解析（low/medium/high × 1k/2k/4k）必須。
      // 解析失敗時は OpenAI を呼ばずに openai_provider_error を返す（防御ガード）。
      // isOpenAIImageModel は "gpt-image-" prefix を見るだけなので
      // "gpt-image-bogus" は分岐に入るが、parseGptImage2Model が null を返す。
      const openaiClient = jest.fn();
      const result = (await dispatchGuestImageGeneration({
        model: "gpt-image-bogus" as never,
        promptText: "x",
        uploadImage: createPngFile(),
        geminiApiKey: "(unused)",
        openaiApiKey: "openai-key",
        openaiClient,
      })) as Extract<
        DispatchGuestImageGenerationResult,
        { kind: "openai_provider_error" }
      >;
      expect(result.kind).toBe("openai_provider_error");
      expect(result.message).toContain("Invalid GPT Image 2 model");
      expect(openaiClient).not.toHaveBeenCalled();
    });
  });
});

describe("GUEST_ALLOWED_MODELS re-export", () => {
  test("model-config の正本と一致する配列を guest-generate からも参照できる", () => {
    // 呼び出し側（API ハンドラ）は guest-generate.ts から GUEST_ALLOWED_MODELS を
    // 取り出して許可リスト比較に使うため、ここで参照が解決することを担保する。
    expect(Array.isArray(GUEST_ALLOWED_MODELS)).toBe(true);
    expect(GUEST_ALLOWED_MODELS).toContain("gpt-image-2-low-1k");
  });
});
