import {
  formatImageSize,
  getModelBrandName,
  getModelDisplayInfo,
} from "@/features/generation/lib/model-display";

describe("getModelBrandName", () => {
  describe("ChatGPT Images 2.0", () => {
    it("returns 'ChatGPT Images 2.0' for gpt-image-* prefix", () => {
      expect(getModelBrandName("gpt-image-2-low-1k")).toBe("ChatGPT Images 2.0");
      expect(getModelBrandName("gpt-image-2-high")).toBe("ChatGPT Images 2.0");
      expect(getModelBrandName("gpt-image-3-something-future")).toBe(
        "ChatGPT Images 2.0",
      );
    });
  });

  describe("Nano Banana Pro", () => {
    it("returns 'Nano Banana Pro' for gemini-3-pro-image-* prefix", () => {
      expect(getModelBrandName("gemini-3-pro-image-1k")).toBe("Nano Banana Pro");
      expect(getModelBrandName("gemini-3-pro-image-2k")).toBe("Nano Banana Pro");
      expect(getModelBrandName("gemini-3-pro-image-4k")).toBe("Nano Banana Pro");
    });
  });

  describe("Nano Banana 2", () => {
    it("returns 'Nano Banana 2' for gemini-3.1-flash-image-* prefix", () => {
      expect(getModelBrandName("gemini-3.1-flash-image-preview-512")).toBe(
        "Nano Banana 2",
      );
      expect(getModelBrandName("gemini-3.1-flash-image-preview-1024")).toBe(
        "Nano Banana 2",
      );
    });

    it("returns 'Nano Banana 2' for the legacy gemini-2.5-flash-image exact match", () => {
      expect(getModelBrandName("gemini-2.5-flash-image")).toBe("Nano Banana 2");
    });
  });

  describe("unrecognized inputs", () => {
    it("returns null for unknown prefix", () => {
      expect(getModelBrandName("dall-e-3")).toBeNull();
      expect(getModelBrandName("midjourney-v6")).toBeNull();
      expect(getModelBrandName("gemini-2.0-flash")).toBeNull();
    });

    it("returns null for null / undefined / empty string", () => {
      expect(getModelBrandName(null)).toBeNull();
      expect(getModelBrandName(undefined)).toBeNull();
      expect(getModelBrandName("")).toBeNull();
    });

    it("does not match a substring without prefix", () => {
      // 念のため: 末尾が gpt-image- 等で終わるだけでは null
      expect(getModelBrandName("custom-gpt-image-experiment")).toBeNull();
    });
  });
});

describe("getModelDisplayInfo", () => {
  it("returns the list display name and default size for known models", () => {
    // ChatGPT は動的サイジングにより tier 名 (1K/2K/4K) が実サイズと
    // 乖離するため displayName から外している。実サイズはサイズバッジで表示。
    expect(getModelDisplayInfo("gpt-image-2-low-1k")).toEqual({
      displayName: "ChatGPT Images 2.0 | Low",
      defaultSize: { width: 1024, height: 1024 },
    });
    expect(getModelDisplayInfo("gpt-image-2-medium-2k")).toEqual({
      displayName: "ChatGPT Images 2.0 | Medium",
      defaultSize: { width: 2048, height: 2048 },
    });
    expect(getModelDisplayInfo("gpt-image-2-high-4k")).toEqual({
      displayName: "ChatGPT Images 2.0 | High",
      defaultSize: { width: 2880, height: 2880 },
    });
    expect(
      getModelDisplayInfo("gemini-3.1-flash-image-preview-512"),
    ).toEqual({
      displayName: "Nano Banana 2",
      defaultSize: { width: 512, height: 512 },
    });
    expect(getModelDisplayInfo("gemini-3-pro-image-4k")).toEqual({
      displayName: "Nano Banana Pro",
      defaultSize: { width: 4096, height: 4096 },
    });
  });

  it("returns a neutral fallback for unknown or missing models", () => {
    const fallback = {
      displayName: "AI モデル",
      defaultSize: { width: 1024, height: 1024 },
    };

    expect(getModelDisplayInfo("unknown-model")).toEqual(fallback);
    expect(getModelDisplayInfo(null)).toEqual(fallback);
    expect(getModelDisplayInfo(undefined)).toEqual(fallback);
  });
});

describe("formatImageSize", () => {
  it("formats explicit positive dimensions", () => {
    expect(formatImageSize(2048, 1536, { width: 1024, height: 1024 })).toBe(
      "2048×1536",
    );
  });

  it("falls back when dimensions are missing or invalid", () => {
    expect(formatImageSize(null, 0, { width: 512, height: 768 })).toBe(
      "512×768",
    );
    expect(formatImageSize(-1, undefined, { width: 1024, height: 1024 })).toBe(
      "1024×1024",
    );
  });
});
