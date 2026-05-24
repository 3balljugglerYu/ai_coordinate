/** @jest-environment node */

import {
  callOpenAIImageEdit,
  callOpenAIImageEditBatch,
  callOpenAIImageEditMultiInput,
  parseImageDimensions,
  resolveOpenAITargetSize,
} from "@/features/generation/lib/openai-image";
import {
  OPENAI_PROVIDER_ERROR,
  SAFETY_POLICY_BLOCKED_ERROR,
} from "@/shared/generation/errors";

const PNG_1024x1024_HEADER = (() => {
  // 24 byte 以上の最小 PNG ヘッダ + IHDR チャンク
  const buf = Buffer.alloc(24);
  // PNG signature
  buf.writeUInt32BE(0x89504e47, 0);
  buf.writeUInt32BE(0x0d0a1a0a, 4);
  // IHDR length=13 (4 bytes) + "IHDR" (4 bytes) + 4 bytes width + 4 bytes height
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12);
  buf.writeUInt32BE(1024, 16);
  buf.writeUInt32BE(1024, 20);
  return buf;
})();

const PNG_1024x1024_BASE64 = PNG_1024x1024_HEADER.toString("base64");

const DEFAULT_OPENAI_EDIT_PARAMS = {
  quality: "low" as const,
  sizeTier: "1k" as const,
};

function createPngHeader(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24);
  buf.writeUInt32BE(0x89504e47, 0);
  buf.writeUInt32BE(0x0d0a1a0a, 4);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12);
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function createJpegHeader(width: number, height: number): Buffer {
  return Buffer.from([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x04,
    0x00,
    0x00,
    0xff,
    0xc0,
    0x00,
    0x0b,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x03,
    0x01,
  ]);
}

function createWebpVp8Header(width: number, height: number): Buffer {
  const buf = Buffer.alloc(30);
  buf.write("RIFF", 0);
  buf.write("WEBP", 8);
  buf.write("VP8 ", 12);
  buf[26] = width & 0xff;
  buf[27] = (width >> 8) & 0xff;
  buf[28] = height & 0xff;
  buf[29] = (height >> 8) & 0xff;
  return buf;
}

function createWebpVp8LHeader(width: number, height: number): Buffer {
  const buf = Buffer.alloc(30);
  const w = width - 1;
  const h = height - 1;
  buf.write("RIFF", 0);
  buf.write("WEBP", 8);
  buf.write("VP8L", 12);
  buf[21] = w & 0xff;
  buf[22] = ((w >> 8) & 0x3f) | ((h & 0x03) << 6);
  buf[23] = (h >> 2) & 0xff;
  buf[24] = (h >> 10) & 0x0f;
  return buf;
}

function createWebpVp8XHeader(width: number, height: number): Buffer {
  const buf = Buffer.alloc(30);
  const w = width - 1;
  const h = height - 1;
  buf.write("RIFF", 0);
  buf.write("WEBP", 8);
  buf.write("VP8X", 12);
  buf[24] = w & 0xff;
  buf[25] = (w >> 8) & 0xff;
  buf[26] = (w >> 16) & 0xff;
  buf[27] = h & 0xff;
  buf[28] = (h >> 8) & 0xff;
  buf[29] = (h >> 16) & 0xff;
  return buf;
}

describe("openai-image (Node port)", () => {
  describe("parseImageDimensions", () => {
    test("PNG ヘッダーから width/height を抽出する", () => {
      expect(
        parseImageDimensions(new Uint8Array(PNG_1024x1024_HEADER), "image/png")
      ).toEqual({ width: 1024, height: 1024 });
    });

    test("JPEG SOF ヘッダーから width/height を抽出する", () => {
      expect(
        parseImageDimensions(new Uint8Array(createJpegHeader(800, 1200)), "image/jpeg")
      ).toEqual({ width: 800, height: 1200 });
    });

    test("JPEG セグメント長が不正な場合は null", () => {
      expect(
        parseImageDimensions(
          new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01]),
          "image/jpeg"
        )
      ).toBeNull();
    });

    test.each([
      ["VP8", createWebpVp8Header(640, 480)],
      ["VP8L", createWebpVp8LHeader(320, 240)],
      ["VP8X", createWebpVp8XHeader(1024, 768)],
    ])("WebP %s ヘッダーから width/height を抽出する", (_, header) => {
      expect(parseImageDimensions(new Uint8Array(header), "image/webp")).toEqual(
        expect.objectContaining({
          width: expect.any(Number),
          height: expect.any(Number),
        })
      );
    });

    test("WebP RIFF/WEBP シグネチャが不正な場合は null", () => {
      expect(
        parseImageDimensions(new Uint8Array(Buffer.alloc(30)), "image/webp")
      ).toBeNull();
    });

    test("未対応 MIME の場合は null", () => {
      expect(parseImageDimensions(new Uint8Array(8), "image/gif")).toBeNull();
      expect(parseImageDimensions(new Uint8Array(8), "image/svg+xml")).toBeNull();
    });
  });

  describe("resolveOpenAITargetSize", () => {
    // 動的サイジング (computeGptImage2OptimalSize) により、tier の総ピクセル
    // 上限内で入力アスペクト比を保ったまま最大サイズで生成される。1:1 入力は
    // 旧 1024×1024（バケット固定）ではなく 1K では 1248×1248 ≒ 1.55M ピクセル
    // まで拡張される。
    test("1:1 入力は 1K で 1248x1248（pixel budget まで拡張）", () => {
      expect(
        resolveOpenAITargetSize({
          base64: PNG_1024x1024_BASE64,
          mimeType: "image/png",
        })
      ).toBe("1248x1248");
    });

    test("1:2 縦長は 1K で 9:16 にクランプされ 864x1536 を返す", () => {
      expect(
        resolveOpenAITargetSize({
          base64: createPngHeader(512, 1024).toString("base64"),
          mimeType: "image/png",
        })
      ).toBe("864x1536");
    });

    test("3:2 横長は 1K で 1536x1024", () => {
      expect(
        resolveOpenAITargetSize({
          base64: createPngHeader(1536, 1024).toString("base64"),
          mimeType: "image/png",
        })
      ).toBe("1536x1024");
    });

    test("解析できない画像は 1:1 フォールバックで 1248x1248", () => {
      expect(
        resolveOpenAITargetSize({
          base64: Buffer.from("garbage").toString("base64"),
          mimeType: "image/png",
        })
      ).toBe("1248x1248");
    });

    test("GIF は寸法取得不能のためフォールバックで 1248x1248", () => {
      expect(
        resolveOpenAITargetSize({
          base64: Buffer.alloc(10).toString("base64"),
          mimeType: "image/gif",
        })
      ).toBe("1248x1248");
    });

    test("2k で 1:2 縦長は 9:16 にクランプされ 1408x2496 を返す", () => {
      expect(
        resolveOpenAITargetSize(
          {
            base64: createPngHeader(512, 1024).toString("base64"),
            mimeType: "image/png",
          },
          "2k"
        )
      ).toBe("1408x2496");
    });

    test("4k 正方形は pixel budget 内の 2880x2880 にクランプする", () => {
      expect(
        resolveOpenAITargetSize(
          {
            base64: PNG_1024x1024_BASE64,
            mimeType: "image/png",
          },
          "4k"
        )
      ).toBe("2880x2880");
    });

    test("1:3 の極端な縦長でも 9:16 にクランプされ 864x1536 を返す", () => {
      expect(
        resolveOpenAITargetSize({
          base64: createPngHeader(512, 1536).toString("base64"),
          mimeType: "image/png",
        })
      ).toBe("864x1536");
    });

    test("3:1 の極端な横長でも 16:9 にクランプされ 1536x864 を返す", () => {
      expect(
        resolveOpenAITargetSize({
          base64: createPngHeader(1536, 512).toString("base64"),
          mimeType: "image/png",
        })
      ).toBe("1536x864");
    });
  });

  describe("callOpenAIImageEdit", () => {
    test("API キー未設定なら OPENAI_PROVIDER_ERROR で fail", async () => {
      const fetchFn = jest.fn();
      await expect(
        callOpenAIImageEdit({
          ...DEFAULT_OPENAI_EDIT_PARAMS,
          prompt: "test",
          inputImage: { base64: PNG_1024x1024_BASE64, mimeType: "image/png" },
          timeoutMs: 1000,
          fetchFn: fetchFn as unknown as typeof fetch,
          apiKey: "",
        })
      ).rejects.toThrow(new RegExp(OPENAI_PROVIDER_ERROR));
      expect(fetchFn).not.toHaveBeenCalled();
    });

    test("GIF 入力は OPENAI_PROVIDER_ERROR で fail（リトライ非対応）", async () => {
      const fetchFn = jest.fn();
      await expect(
        callOpenAIImageEdit({
          ...DEFAULT_OPENAI_EDIT_PARAMS,
          prompt: "test",
          inputImage: { base64: "AA==", mimeType: "image/gif" },
          timeoutMs: 1000,
          fetchFn: fetchFn as unknown as typeof fetch,
          apiKey: "test-key",
        })
      ).rejects.toThrow(new RegExp(OPENAI_PROVIDER_ERROR));
      expect(fetchFn).not.toHaveBeenCalled();
    });

    test("成功時は data URL 用の base64 と mimeType=image/png を返す", async () => {
      const fetchFn = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [{ b64_json: "RESULT_BASE64" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
      const result = await callOpenAIImageEdit({
        ...DEFAULT_OPENAI_EDIT_PARAMS,
        quality: "medium",
        sizeTier: "4k",
        prompt: "test",
        inputImage: { base64: PNG_1024x1024_BASE64, mimeType: "image/png" },
        timeoutMs: 1000,
        fetchFn: fetchFn as unknown as typeof fetch,
        apiKey: "test-key",
      });
      expect(result).toEqual({ data: "RESULT_BASE64", mimeType: "image/png" });
      expect(fetchFn).toHaveBeenCalledWith(
        "https://api.openai.com/v1/images/edits",
        expect.objectContaining({ method: "POST" })
      );
      const requestBody = (
        fetchFn.mock.calls[0][1] as RequestInit
      ).body as FormData;
      expect(requestBody.get("model")).toBe("gpt-image-2");
      expect(requestBody.get("quality")).toBe("medium");
      expect(requestBody.get("size")).toBe("2880x2880");
      expect(requestBody.get("n")).toBe("1");
    });

    test("HTTP 400 + content_policy_violation は SAFETY_POLICY_BLOCKED_ERROR で throw", async () => {
      const fetchFn = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: "content_policy_violation", message: "blocked" },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      );
      await expect(
        callOpenAIImageEdit({
          ...DEFAULT_OPENAI_EDIT_PARAMS,
          prompt: "test",
          inputImage: { base64: PNG_1024x1024_BASE64, mimeType: "image/png" },
          timeoutMs: 1000,
          fetchFn: fetchFn as unknown as typeof fetch,
          apiKey: "test-key",
        })
      ).rejects.toThrow(SAFETY_POLICY_BLOCKED_ERROR);
    });

    test("HTTP 401 (認証エラー) は OPENAI_PROVIDER_ERROR で throw", async () => {
      const fetchFn = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: "invalid_api_key", message: "Incorrect API key" },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        )
      );
      await expect(
        callOpenAIImageEdit({
          ...DEFAULT_OPENAI_EDIT_PARAMS,
          prompt: "test",
          inputImage: { base64: PNG_1024x1024_BASE64, mimeType: "image/png" },
          timeoutMs: 1000,
          fetchFn: fetchFn as unknown as typeof fetch,
          apiKey: "test-key",
        })
      ).rejects.toThrow(new RegExp(OPENAI_PROVIDER_ERROR));
    });

    test("HTTP 429 insufficient_quota は OPENAI_PROVIDER_ERROR で throw", async () => {
      const fetchFn = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: "insufficient_quota", message: "quota exceeded" },
          }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        )
      );
      await expect(
        callOpenAIImageEdit({
          ...DEFAULT_OPENAI_EDIT_PARAMS,
          prompt: "test",
          inputImage: { base64: PNG_1024x1024_BASE64, mimeType: "image/png" },
          timeoutMs: 1000,
          fetchFn: fetchFn as unknown as typeof fetch,
          apiKey: "test-key",
        })
      ).rejects.toThrow(new RegExp(OPENAI_PROVIDER_ERROR));
    });

    test("HTTP 429 rate limit は Retry-After 後に新しい FormData/File で再試行する", async () => {
      const fetchFn = jest
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              error: { code: "rate_limit_exceeded", message: "slow down" },
            }),
            {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "Retry-After": "0",
              },
            }
          )
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ data: [{ b64_json: "RESULT_BASE64" }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );

      await expect(
        callOpenAIImageEdit({
          ...DEFAULT_OPENAI_EDIT_PARAMS,
          prompt: "test",
          inputImage: { base64: PNG_1024x1024_BASE64, mimeType: "image/png" },
          timeoutMs: 1000,
          fetchFn: fetchFn as unknown as typeof fetch,
          apiKey: "test-key",
        })
      ).resolves.toEqual({ data: "RESULT_BASE64", mimeType: "image/png" });

      expect(fetchFn).toHaveBeenCalledTimes(2);
      const firstBody = (fetchFn.mock.calls[0][1] as RequestInit)
        .body as FormData;
      const secondBody = (fetchFn.mock.calls[1][1] as RequestInit)
        .body as FormData;
      expect(firstBody).not.toBe(secondBody);
      expect(firstBody.get("image[]")).not.toBe(secondBody.get("image[]"));
    });

    test("HTTP 429 rate limit は Retry-After の HTTP date 形式も扱う", async () => {
      const fetchFn = jest
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              error: { code: "rate_limit_exceeded", message: "slow down" },
            }),
            {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "Retry-After": new Date(Date.now() - 1000).toUTCString(),
              },
            }
          )
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ data: [{ b64_json: "RESULT_BASE64" }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );

      await expect(
        callOpenAIImageEdit({
          ...DEFAULT_OPENAI_EDIT_PARAMS,
          prompt: "test",
          inputImage: { base64: PNG_1024x1024_BASE64, mimeType: "image/png" },
          timeoutMs: 1000,
          fetchFn: fetchFn as unknown as typeof fetch,
          apiKey: "test-key",
        })
      ).resolves.toEqual({ data: "RESULT_BASE64", mimeType: "image/png" });

      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    test("batch は n 件の生成結果を返し、FormData に n を載せる", async () => {
      const fetchFn = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [{ b64_json: "RESULT_A" }, { b64_json: "RESULT_B" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      await expect(
        callOpenAIImageEditBatch({
          ...DEFAULT_OPENAI_EDIT_PARAMS,
          prompt: "test",
          inputImage: { base64: PNG_1024x1024_BASE64, mimeType: "image/png" },
          timeoutMs: 1000,
          fetchFn: fetchFn as unknown as typeof fetch,
          apiKey: "test-key",
          n: 2,
        })
      ).resolves.toEqual([
        { data: "RESULT_A", mimeType: "image/png" },
        { data: "RESULT_B", mimeType: "image/png" },
      ]);

      const requestBody = (
        fetchFn.mock.calls[0][1] as RequestInit
      ).body as FormData;
      expect(requestBody.get("n")).toBe("2");
    });

    test("batch の n が範囲外なら fetch せず fail", async () => {
      const fetchFn = jest.fn();

      await expect(
        callOpenAIImageEditBatch({
          ...DEFAULT_OPENAI_EDIT_PARAMS,
          prompt: "test",
          inputImage: { base64: PNG_1024x1024_BASE64, mimeType: "image/png" },
          timeoutMs: 1000,
          fetchFn: fetchFn as unknown as typeof fetch,
          apiKey: "test-key",
          n: 11,
        })
      ).rejects.toThrow(/n must be an integer between 1 and 10/);

      expect(fetchFn).not.toHaveBeenCalled();
    });

    test("batch の返却枚数が n と違う場合は fail", async () => {
      const fetchFn = jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ b64_json: "RESULT_A" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      await expect(
        callOpenAIImageEditBatch({
          ...DEFAULT_OPENAI_EDIT_PARAMS,
          prompt: "test",
          inputImage: { base64: PNG_1024x1024_BASE64, mimeType: "image/png" },
          timeoutMs: 1000,
          fetchFn: fetchFn as unknown as typeof fetch,
          apiKey: "test-key",
          n: 2,
        })
      ).rejects.toThrow(/returned 1 images, expected 2/);
    });

    test("multi input は targetSizeBaseIndex の画像比率で size を決め、複数 image[] を送る", async () => {
      const fetchFn = jest.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [{ b64_json: "RESULT_A" }, { b64_json: "RESULT_B" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      await expect(
        callOpenAIImageEditMultiInput({
          quality: "high",
          sizeTier: "2k",
          prompt: "test",
          inputImages: [
            { base64: PNG_1024x1024_BASE64, mimeType: "image/png" },
            {
              base64: createPngHeader(512, 1024).toString("base64"),
              mimeType: "image/png",
            },
          ],
          targetSizeBaseIndex: 1,
          timeoutMs: 1000,
          fetchFn: fetchFn as unknown as typeof fetch,
          apiKey: "test-key",
          n: 2,
        })
      ).resolves.toEqual([
        { data: "RESULT_A", mimeType: "image/png" },
        { data: "RESULT_B", mimeType: "image/png" },
      ]);

      const requestBody = (
        fetchFn.mock.calls[0][1] as RequestInit
      ).body as FormData;
      expect(requestBody.get("quality")).toBe("high");
      // 動的サイジング: targetSizeBaseIndex=1 の画像 (512x1024 = 1:2) で 2k
      // → 出力アスペクト 9:16 にクランプされ 1408x2496
      expect(requestBody.get("size")).toBe("1408x2496");
      expect(requestBody.getAll("image[]")).toHaveLength(2);
      expect(requestBody.get("n")).toBe("2");
    });

    test("multi input は入力なしを拒否する", async () => {
      const fetchFn = jest.fn();

      await expect(
        callOpenAIImageEditMultiInput({
          ...DEFAULT_OPENAI_EDIT_PARAMS,
          prompt: "test",
          inputImages: [],
          timeoutMs: 1000,
          fetchFn: fetchFn as unknown as typeof fetch,
          apiKey: "test-key",
        })
      ).rejects.toThrow(/inputImages must not be empty/);

      expect(fetchFn).not.toHaveBeenCalled();
    });

    test("multi input は GIF を含む入力を拒否する", async () => {
      const fetchFn = jest.fn();

      await expect(
        callOpenAIImageEditMultiInput({
          ...DEFAULT_OPENAI_EDIT_PARAMS,
          prompt: "test",
          inputImages: [
            { base64: PNG_1024x1024_BASE64, mimeType: "image/png" },
            { base64: "AA==", mimeType: "image/gif" },
          ],
          timeoutMs: 1000,
          fetchFn: fetchFn as unknown as typeof fetch,
          apiKey: "test-key",
        })
      ).rejects.toThrow(new RegExp(OPENAI_PROVIDER_ERROR));

      expect(fetchFn).not.toHaveBeenCalled();
    });

    test("HTTP 500 で JSON を読めない場合は status 由来のメッセージを throw", async () => {
      const fetchFn = jest.fn().mockResolvedValue(
        new Response("not json", {
          status: 500,
          headers: { "Content-Type": "text/plain" },
        })
      );
      await expect(
        callOpenAIImageEdit({
          ...DEFAULT_OPENAI_EDIT_PARAMS,
          prompt: "test",
          inputImage: { base64: PNG_1024x1024_BASE64, mimeType: "image/png" },
          timeoutMs: 1000,
          fetchFn: fetchFn as unknown as typeof fetch,
          apiKey: "test-key",
        })
      ).rejects.toThrow("OpenAI HTTP 500");
    });

    test("data[0].b64_json が空なら 'No images generated' で throw", async () => {
      const fetchFn = jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [{ b64_json: "" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
      await expect(
        callOpenAIImageEdit({
          ...DEFAULT_OPENAI_EDIT_PARAMS,
          prompt: "test",
          inputImage: { base64: PNG_1024x1024_BASE64, mimeType: "image/png" },
          timeoutMs: 1000,
          fetchFn: fetchFn as unknown as typeof fetch,
          apiKey: "test-key",
        })
      ).rejects.toThrow(/No images generated/);
    });

    test("200 OK でも JSON が壊れている場合は 'No images generated' で throw", async () => {
      const fetchFn = jest.fn().mockResolvedValue(
        new Response("not json", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
      await expect(
        callOpenAIImageEdit({
          ...DEFAULT_OPENAI_EDIT_PARAMS,
          prompt: "test",
          inputImage: { base64: PNG_1024x1024_BASE64, mimeType: "image/png" },
          timeoutMs: 1000,
          fetchFn: fetchFn as unknown as typeof fetch,
          apiKey: "test-key",
        })
      ).rejects.toThrow(/No images generated/);
    });
  });
});
