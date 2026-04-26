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

describe("openai-image (Node port)", () => {
  describe("parseImageDimensions", () => {
    test("PNG ヘッダーから width/height を抽出する", () => {
      expect(
        parseImageDimensions(new Uint8Array(PNG_1024x1024_HEADER), "image/png")
      ).toEqual({ width: 1024, height: 1024 });
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
