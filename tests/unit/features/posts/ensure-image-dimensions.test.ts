/** @jest-environment node */

import {
  ensureImageDimensions,
  type ImageRowSubset,
} from "@/features/posts/lib/ensure-image-dimensions";

function makeParams(
  overrides: {
    data?: ImageRowSubset;
    useCache?: boolean;
    fetchDimensions?: jest.Mock;
    resolveImageUrl?: jest.Mock;
    updateRow?: jest.Mock;
  } = {},
) {
  return {
    data: overrides.data ?? {},
    useCache: overrides.useCache ?? false,
    fetchDimensions:
      overrides.fetchDimensions ??
      jest.fn().mockResolvedValue({ width: 1024, height: 1536 }),
    resolveImageUrl:
      overrides.resolveImageUrl ??
      jest.fn(() => "https://cdn.example.com/img.png"),
    updateRow: overrides.updateRow ?? jest.fn().mockResolvedValue(undefined),
  };
}

describe("ensureImageDimensions", () => {
  beforeEach(() => {
    jest.spyOn(console, "warn").mockImplementation(() => {
      // suppress in tests
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("when all values are already populated", () => {
    it("returns existing values without fetching or updating", async () => {
      const params = makeParams({
        data: {
          width: 1024,
          height: 1536,
          image_url: "https://cdn.example.com/img.png",
        },
      });

      const result = await ensureImageDimensions(params);

      expect(result).toEqual({
        width: 1024,
        height: 1536,
      });
      expect(params.fetchDimensions).not.toHaveBeenCalled();
      expect(params.updateRow).not.toHaveBeenCalled();
    });
  });

  describe("when useCache=true", () => {
    it("computes and returns dimensions but does NOT issue a DB UPDATE", async () => {
      const params = makeParams({
        data: { image_url: "https://cdn.example.com/img.png" },
        useCache: true,
      });

      const result = await ensureImageDimensions(params);

      expect(result).toEqual({
        width: 1024,
        height: 1536,
      });
      expect(params.fetchDimensions).toHaveBeenCalledTimes(1);
      expect(params.updateRow).not.toHaveBeenCalled();
    });
  });

  describe("when useCache=false", () => {
    it("UPDATEs only the fields that were null on the input row", async () => {
      const params = makeParams({
        data: {
          width: 1024, // already set
          height: null, // missing
          image_url: "https://cdn.example.com/img.png",
        },
      });

      const result = await ensureImageDimensions(params);

      expect(result).toEqual({
        width: 1024,
        height: 1536,
      });
      expect(params.updateRow).toHaveBeenCalledTimes(1);
      expect(params.updateRow).toHaveBeenCalledWith({
        height: 1536,
      });
    });

    it("UPDATEs width and height when both are null", async () => {
      const params = makeParams({
        data: { image_url: "https://cdn.example.com/img.png" },
      });

      await ensureImageDimensions(params);

      expect(params.updateRow).toHaveBeenCalledWith({
        width: 1024,
        height: 1536,
      });
    });

    it("persists landscape dimensions without deriving orientation metadata", async () => {
      const params = makeParams({
        data: { image_url: "https://cdn.example.com/img.png" },
        fetchDimensions: jest
          .fn()
          .mockResolvedValue({ width: 1536, height: 1024 }),
      });

      const result = await ensureImageDimensions(params);

      expect(result).toEqual({
        width: 1536,
        height: 1024,
      });
      expect(params.updateRow).toHaveBeenCalledWith({
        width: 1536,
        height: 1024,
      });
    });

    it("does not UPDATE when nothing changed", async () => {
      // 既に全列が埋まっていれば fetchDimensions も呼ばないが、
      // 「fetch したが情報が新規でない」理論上のケースを念のため確認する
      const params = makeParams({
        data: {
          width: 1024,
          height: 1536,
          image_url: "https://cdn.example.com/img.png",
        },
      });

      await ensureImageDimensions(params);

      expect(params.fetchDimensions).not.toHaveBeenCalled();
      expect(params.updateRow).not.toHaveBeenCalled();
    });
  });

  describe("when image dimensions cannot be obtained", () => {
    it("returns null values without UPDATE if resolveImageUrl returns null", async () => {
      const params = makeParams({
        data: { image_url: null, storage_path: null },
        resolveImageUrl: jest.fn(() => null),
      });

      const result = await ensureImageDimensions(params);

      expect(result).toEqual({
        width: null,
        height: null,
      });
      expect(params.fetchDimensions).not.toHaveBeenCalled();
      expect(params.updateRow).not.toHaveBeenCalled();
    });

    it("returns null values when fetchDimensions resolves to null", async () => {
      const params = makeParams({
        data: { image_url: "https://cdn.example.com/img.png" },
        fetchDimensions: jest.fn().mockResolvedValue(null),
      });

      const result = await ensureImageDimensions(params);

      expect(result).toEqual({
        width: null,
        height: null,
      });
      expect(params.updateRow).not.toHaveBeenCalled();
    });

    it("returns null values when fetchDimensions throws", async () => {
      const params = makeParams({
        data: { image_url: "https://cdn.example.com/img.png" },
        fetchDimensions: jest.fn().mockRejectedValue(new Error("boom")),
      });

      const result = await ensureImageDimensions(params);

      expect(result).toEqual({
        width: null,
        height: null,
      });
      expect(params.updateRow).not.toHaveBeenCalled();
    });
  });

  describe("when updateRow throws", () => {
    it("swallows the error and returns the computed values", async () => {
      const params = makeParams({
        data: { image_url: "https://cdn.example.com/img.png" },
        updateRow: jest.fn().mockRejectedValue(new Error("update conflict")),
      });

      const result = await ensureImageDimensions(params);

      expect(result).toEqual({
        width: 1024,
        height: 1536,
      });
    });
  });

  describe("input sanitization", () => {
    it("ignores non-positive width/height as if missing", async () => {
      const params = makeParams({
        data: {
          width: 0,
          height: -1,
          image_url: "https://cdn.example.com/img.png",
        },
      });

      const result = await ensureImageDimensions(params);

      expect(result).toEqual({
        width: 1024,
        height: 1536,
      });
      expect(params.fetchDimensions).toHaveBeenCalledTimes(1);
    });
  });
});
