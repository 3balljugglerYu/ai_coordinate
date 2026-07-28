import { getGenerationModeLabelKey } from "@/features/posts/lib/generation-mode-label";

describe("getGenerationModeLabelKey", () => {
  it("collapses the coordinate family into modeCoordinate", () => {
    for (const type of [
      "coordinate",
      "specified_coordinate",
      "full_body",
      "chibi",
    ] as const) {
      expect(getGenerationModeLabelKey(type)).toBe("modeCoordinate");
    }
  });

  it("maps one_tap_style / inspire / free to their own keys", () => {
    expect(getGenerationModeLabelKey("one_tap_style")).toBe("modeOneTapStyle");
    expect(getGenerationModeLabelKey("inspire")).toBe("modeInspire");
    expect(getGenerationModeLabelKey("free")).toBe("modeFree");
  });

  it("returns null for unknown / null / undefined", () => {
    expect(getGenerationModeLabelKey(null)).toBeNull();
    expect(getGenerationModeLabelKey(undefined)).toBeNull();
    expect(getGenerationModeLabelKey("")).toBeNull();
    expect(getGenerationModeLabelKey("something_else")).toBeNull();
  });
});
