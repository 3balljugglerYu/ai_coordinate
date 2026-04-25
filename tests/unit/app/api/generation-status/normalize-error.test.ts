/** @jest-environment node */

import { normalizeUserFacingGenerationError } from "@/features/generation/lib/normalize-generation-error";
import { getGenerationRouteCopy } from "@/features/generation/lib/route-copy";
import {
  OPENAI_PROVIDER_ERROR,
  SAFETY_POLICY_BLOCKED_ERROR,
  MALFORMED_GEMINI_PARTS_ERROR,
  INVALID_GEMINI_ARGUMENT_ERROR,
} from "@/shared/generation/errors";

const copy = getGenerationRouteCopy("ja");

describe("normalizeUserFacingGenerationError", () => {
  it("returns the original message when status is not 'failed'", () => {
    expect(
      normalizeUserFacingGenerationError("succeeded", "anything", copy),
    ).toBe("anything");
    expect(
      normalizeUserFacingGenerationError("processing", null, copy),
    ).toBeNull();
  });

  it("returns the original message when errorMessage is null even on failed", () => {
    expect(normalizeUserFacingGenerationError("failed", null, copy)).toBeNull();
  });

  it("maps 'No images generated' to copy.noImagesGenerated", () => {
    expect(
      normalizeUserFacingGenerationError("failed", "No images generated", copy),
    ).toBe(copy.noImagesGenerated);
  });

  it("maps safety policy block messages to copy.safetyBlocked", () => {
    expect(
      normalizeUserFacingGenerationError(
        "failed",
        SAFETY_POLICY_BLOCKED_ERROR,
        copy,
      ),
    ).toBe(copy.safetyBlocked);
  });

  it("maps malformed Gemini parts messages to copy.genericGenerationFailed", () => {
    expect(
      normalizeUserFacingGenerationError(
        "failed",
        MALFORMED_GEMINI_PARTS_ERROR,
        copy,
      ),
    ).toBe(copy.genericGenerationFailed);
  });

  it("maps invalid Gemini argument messages to copy.genericGenerationFailed", () => {
    expect(
      normalizeUserFacingGenerationError(
        "failed",
        INVALID_GEMINI_ARGUMENT_ERROR,
        copy,
      ),
    ).toBe(copy.genericGenerationFailed);
  });

  it("maps OpenAI provider errors (org verification) to copy.genericGenerationFailed", () => {
    expect(
      normalizeUserFacingGenerationError(
        "failed",
        `${OPENAI_PROVIDER_ERROR}: Your organization must be verified to use the model gpt-image-2.`,
        copy,
      ),
    ).toBe(copy.genericGenerationFailed);
  });

  it("maps OpenAI provider errors (GIF rejection) to copy.genericGenerationFailed", () => {
    expect(
      normalizeUserFacingGenerationError(
        "failed",
        `${OPENAI_PROVIDER_ERROR}: GIF images are not supported by gpt-image-2; please upload PNG, JPEG, or WebP`,
        copy,
      ),
    ).toBe(copy.genericGenerationFailed);
  });

  it("maps OpenAI provider errors (missing API key) to copy.genericGenerationFailed", () => {
    expect(
      normalizeUserFacingGenerationError(
        "failed",
        `${OPENAI_PROVIDER_ERROR}: OPENAI_API_KEY is not configured`,
        copy,
      ),
    ).toBe(copy.genericGenerationFailed);
  });

  it("passes through unknown failed messages unchanged", () => {
    const message = "Something completely unexpected happened";
    expect(
      normalizeUserFacingGenerationError("failed", message, copy),
    ).toBe(message);
  });
});
