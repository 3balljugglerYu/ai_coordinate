/** @jest-environment node */

import {
  deriveAspectRatioFromDimensions,
  getPostBeforeImageUrl,
  getPostImageUrl,
} from "@/features/posts/lib/utils";

describe("posts utils", () => {
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example";
  });

  afterEach(() => {
    if (originalSupabaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    }
  });

  describe("getPostImageUrl", () => {
    it("prefers image_url over storage_path", () => {
      expect(
        getPostImageUrl({
          image_url: "https://cdn.example/direct.png",
          storage_path: "generated/path.png",
        }),
      ).toBe("https://cdn.example/direct.png");
    });

    it("builds a public storage URL from storage_path", () => {
      expect(
        getPostImageUrl({
          image_url: null,
          storage_path: "generated/path.png",
        }),
      ).toBe(
        "https://supabase.example/storage/v1/object/public/generated-images/generated/path.png",
      );
    });

    it("returns an empty string when no image source exists", () => {
      expect(getPostImageUrl({ image_url: null, storage_path: null })).toBe("");
    });
  });

  describe("getPostBeforeImageUrl", () => {
    it("returns null when show_before_image is explicitly false", () => {
      expect(
        getPostBeforeImageUrl({
          show_before_image: false,
          pre_generation_storage_path: "user-1/pre-generation/img-1_display.webp",
          input_image_url_fallback: "https://supabase.example/foo.png",
        }),
      ).toBeNull();
    });

    it("prefers the persisted pre_generation_storage_path", () => {
      expect(
        getPostBeforeImageUrl({
          pre_generation_storage_path: "user-1/pre-generation/img-1_display.webp",
          input_image_url_fallback: "https://supabase.example/temp/foo.png",
        }),
      ).toBe(
        "https://supabase.example/storage/v1/object/public/generated-images/user-1/pre-generation/img-1_display.webp",
      );
    });

    it("falls back to input_image_url_fallback when persisted path is missing", () => {
      expect(
        getPostBeforeImageUrl({
          pre_generation_storage_path: null,
          input_image_url_fallback: "https://supabase.example/temp/foo.png",
        }),
      ).toBe("https://supabase.example/temp/foo.png");
    });

    it("falls back when persisted path cannot be converted to a public URL", () => {
      const consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => {});
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;

      expect(
        getPostBeforeImageUrl({
          pre_generation_storage_path: "user-1/pre-generation/img-1_display.webp",
          input_image_url_fallback: "https://supabase.example/temp/foo.png",
        }),
      ).toBe("https://supabase.example/temp/foo.png");

      expect(consoleWarn).toHaveBeenCalledWith(
        "NEXT_PUBLIC_SUPABASE_URL is not set"
      );
      consoleWarn.mockRestore();
    });

    it("returns null when neither persisted path nor fallback is available", () => {
      expect(
        getPostBeforeImageUrl({
          pre_generation_storage_path: null,
          input_image_url_fallback: null,
        }),
      ).toBeNull();
    });
  });

  describe("deriveAspectRatioFromDimensions", () => {
    it("returns portrait when height is greater than width", () => {
      expect(deriveAspectRatioFromDimensions(768, 1024)).toBe("portrait");
    });

    it("returns landscape for wide or square dimensions", () => {
      expect(deriveAspectRatioFromDimensions(1024, 768)).toBe("landscape");
      expect(deriveAspectRatioFromDimensions(1024, 1024)).toBe("landscape");
    });

    it("returns null when either dimension is missing or invalid", () => {
      expect(deriveAspectRatioFromDimensions(null, 1024)).toBeNull();
      expect(deriveAspectRatioFromDimensions(1024, undefined)).toBeNull();
      expect(deriveAspectRatioFromDimensions(0, 1024)).toBeNull();
      expect(deriveAspectRatioFromDimensions(1024, -1)).toBeNull();
    });
  });
});
