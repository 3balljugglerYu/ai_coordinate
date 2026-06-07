/** @jest-environment node */

import {
  parseWardrobeClaimRequest,
  WARDROBE_CLAIM_MAX_IMAGE_BASE64_LENGTH,
  WARDROBE_CLAIM_MAX_IMAGE_BYTES,
} from "@/app/api/wardrobe/claim/handler";

// 1x1 透過 PNG (有効な最小画像)
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;

function dataUrlOfSize(contentType: string, byteLength: number): string {
  const base64 = Buffer.alloc(byteLength).toString("base64");
  return `data:${contentType};base64,${base64}`;
}

describe("parseWardrobeClaimRequest", () => {
  describe("正常系", () => {
    test("有効な PNG data URL を decode し contentType と buffer を返す", () => {
      const result = parseWardrobeClaimRequest({
        imageBase64: TINY_PNG_DATA_URL,
        styleId: "style-123",
        prompt: "梅コーデ",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.contentType).toBe("image/png");
      expect(Buffer.isBuffer(result.data.imageBuffer)).toBe(true);
      expect(result.data.imageBuffer.length).toBe(
        Buffer.from(TINY_PNG_BASE64, "base64").length,
      );
      expect(result.data.styleId).toBe("style-123");
      expect(result.data.prompt).toBe("梅コーデ");
    });

    test.each([
      ["image/png", "image/png"],
      ["image/webp", "image/webp"],
      ["image/jpeg", "image/jpeg"],
    ])("contentType %s を抽出する", (mime, expected) => {
      const result = parseWardrobeClaimRequest({
        imageBase64: dataUrlOfSize(mime, 32),
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.contentType).toBe(expected);
    });

    test("styleId/prompt 無しでも ok で両者 null", () => {
      const result = parseWardrobeClaimRequest({
        imageBase64: TINY_PNG_DATA_URL,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.styleId).toBeNull();
      expect(result.data.prompt).toBeNull();
    });

    test("styleId/prompt の前後空白を trim、空文字は null", () => {
      const result = parseWardrobeClaimRequest({
        imageBase64: TINY_PNG_DATA_URL,
        styleId: "  s1  ",
        prompt: "   ",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.styleId).toBe("s1");
      expect(result.data.prompt).toBeNull();
    });

    test("正の整数の width/height は採用する", () => {
      const ok = parseWardrobeClaimRequest({
        imageBase64: TINY_PNG_DATA_URL,
        width: 768,
        height: 1024,
      });
      expect(ok.ok && ok.data.width).toBe(768);
      expect(ok.ok && ok.data.height).toBe(1024);
    });

    test.each([
      ["文字列", "768"],
      ["負数", -1],
      ["ゼロ", 0],
      ["小数", 1.5],
      ["NaN", NaN],
      ["Infinity", Infinity],
    ])("width/height が %s の場合は null に丸める", (_label, value) => {
      const result = parseWardrobeClaimRequest({
        imageBase64: TINY_PNG_DATA_URL,
        width: value,
        height: value,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.width).toBeNull();
      expect(result.data.height).toBeNull();
    });
  });

  describe("境界値", () => {
    test("デコード後ちょうど上限は ok", () => {
      const result = parseWardrobeClaimRequest({
        imageBase64: dataUrlOfSize("image/webp", WARDROBE_CLAIM_MAX_IMAGE_BYTES),
      });
      expect(result.ok).toBe(true);
    });

    test("上限 +1 バイトは IMAGE_TOO_LARGE", () => {
      const result = parseWardrobeClaimRequest({
        imageBase64: dataUrlOfSize(
          "image/webp",
          WARDROBE_CLAIM_MAX_IMAGE_BYTES + 1,
        ),
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("IMAGE_TOO_LARGE");
    });

    test("base64 文字列長が上限超過なら decode 前に IMAGE_TOO_LARGE", () => {
      const result = parseWardrobeClaimRequest({
        imageBase64: "x".repeat(WARDROBE_CLAIM_MAX_IMAGE_BASE64_LENGTH + 1),
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("IMAGE_TOO_LARGE");
    });
  });

  describe("異常系", () => {
    test("imageBase64 欠落は MISSING_IMAGE", () => {
      const result = parseWardrobeClaimRequest({ styleId: "s1" });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("MISSING_IMAGE");
    });

    test("空文字は MISSING_IMAGE", () => {
      const result = parseWardrobeClaimRequest({ imageBase64: "" });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("MISSING_IMAGE");
    });

    test("data URL でない生 base64 は INVALID_IMAGE", () => {
      const result = parseWardrobeClaimRequest({
        imageBase64: TINY_PNG_BASE64,
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("INVALID_IMAGE");
    });

    test("非画像 data URL (text/plain) は INVALID_IMAGE", () => {
      const result = parseWardrobeClaimRequest({
        imageBase64: "data:text/plain;base64,aGVsbG8=",
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("INVALID_IMAGE");
    });

    test.each([
      ["mime 欠落", "data:;base64,aGVsbG8="],
      [";base64 欠落", "data:image/png,aGVsbG8="],
    ])("不正な data URL 形(%s)は INVALID_IMAGE", (_label, value) => {
      const result = parseWardrobeClaimRequest({ imageBase64: value });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("INVALID_IMAGE");
    });

    test.each([
      ["image/gif", "data:image/gif;base64,R0lGODdhAQABAIAAAAAAAAAAACwAAAAAAQABAAACAkQBADs="],
      ["image/svg+xml", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="],
    ])(
      "許可外の image mime(%s)は INVALID_IMAGE(Storage allowlist 整合 + svg XSS 防止)",
      (_label, value) => {
        const result = parseWardrobeClaimRequest({ imageBase64: value });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.code).toBe("INVALID_IMAGE");
      },
    );

    test("base64 部が空の data URL は INVALID_IMAGE", () => {
      const result = parseWardrobeClaimRequest({
        imageBase64: "data:image/png;base64,",
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("INVALID_IMAGE");
    });
  });
});
