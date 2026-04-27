/** @jest-environment node */

import {
  callOpenAIImageEdit,
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
    test("正方形は 1024x1024", () => {
      expect(
        resolveOpenAITargetSize({
          base64: PNG_1024x1024_BASE64,
          mimeType: "image/png",
        })
      ).toBe("1024x1024");
    });

    test("縦長画像は 1024x1536", () => {
      expect(
        resolveOpenAITargetSize({
          base64: createPngHeader(512, 1024).toString("base64"),
          mimeType: "image/png",
        })
      ).toBe("1024x1536");
    });

    test("横長画像は 1536x1024", () => {
      expect(
        resolveOpenAITargetSize({
          base64: createPngHeader(1536, 1024).toString("base64"),
          mimeType: "image/png",
        })
      ).toBe("1536x1024");
    });

    test("解析できない画像は 1024x1024 にフォールバック", () => {
      expect(
        resolveOpenAITargetSize({
          base64: Buffer.from("garbage").toString("base64"),
          mimeType: "image/png",
        })
      ).toBe("1024x1024");
    });

    test("GIF はフォールバックとして 1024x1024", () => {
      expect(
        resolveOpenAITargetSize({
          base64: Buffer.alloc(10).toString("base64"),
          mimeType: "image/gif",
        })
      ).toBe("1024x1024");
    });
  });

  describe("callOpenAIImageEdit", () => {
    test("API キー未設定なら OPENAI_PROVIDER_ERROR で fail", async () => {
      const fetchFn = jest.fn();
      await expect(
        callOpenAIImageEdit({
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
          prompt: "test",
          inputImage: { base64: PNG_1024x1024_BASE64, mimeType: "image/png" },
          timeoutMs: 1000,
          fetchFn: fetchFn as unknown as typeof fetch,
          apiKey: "test-key",
        })
      ).rejects.toThrow(new RegExp(OPENAI_PROVIDER_ERROR));
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
