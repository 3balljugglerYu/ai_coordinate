/** @jest-environment node */

import { normalizeUserFacingGenerationError } from "@/features/generation/lib/normalize-generation-error";
import { getGenerationRouteCopy } from "@/features/generation/lib/route-copy";
import {
  GEMINI_DISABLED_MESSAGE,
  OPENAI_PROVIDER_ERROR,
  SAFETY_POLICY_BLOCKED_ERROR,
  MALFORMED_GEMINI_PARTS_ERROR,
  INVALID_GEMINI_ARGUMENT_ERROR,
  GEMINI_PROVIDER_ERROR,
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

  it("maps Gemini provider errors containing an API key to copy.genericGenerationFailed", () => {
    expect(
      normalizeUserFacingGenerationError(
        "failed",
        `${GEMINI_PROVIDER_ERROR}: Permission denied: Consumer 'api_key:[REDACTED_FOR_TEST]' has been suspended.`,
        copy,
      ),
    ).toBe(copy.genericGenerationFailed);
  });

  it("maps Gemini kill switch messages to copy.modelTemporarilyUnavailable", () => {
    expect(
      normalizeUserFacingGenerationError(
        "failed",
        `${GEMINI_PROVIDER_ERROR}: ${GEMINI_DISABLED_MESSAGE}`,
        copy,
      ),
    ).toBe(copy.modelTemporarilyUnavailable);
  });

  it("maps bare GEMINI_DISABLED_MESSAGE (no prefix) to copy.modelTemporarilyUnavailable", () => {
    expect(
      normalizeUserFacingGenerationError(
        "failed",
        GEMINI_DISABLED_MESSAGE,
        copy,
      ),
    ).toBe(copy.modelTemporarilyUnavailable);
  });

  it("maps OpenAI billing hard limit messages to copy.providerBusy", () => {
    expect(
      normalizeUserFacingGenerationError(
        "failed",
        "Billing hard limit has been reached.",
        copy,
      ),
    ).toBe(copy.providerBusy);
  });

  it("maps billing hard limit messages case-insensitively", () => {
    expect(
      normalizeUserFacingGenerationError(
        "failed",
        "billing HARD LIMIT reached for this organization",
        copy,
      ),
    ).toBe(copy.providerBusy);
  });

  it("hides unknown English messages (they are upstream text)", () => {
    // 私たちがユーザーへ出す文言は必ず日本語。英文は提供元由来と見なす
    expect(
      normalizeUserFacingGenerationError(
        "failed",
        "Something completely unexpected happened",
        copy,
      ),
    ).toBe(copy.genericGenerationFailed);
  });

  it("passes through unknown Japanese messages", () => {
    // 将来こちらで足す説明が握り潰されないようにする
    const message = "この作品は編集中のため生成できません";
    expect(normalizeUserFacingGenerationError("failed", message, copy)).toBe(
      message,
    );
  });

  it("hides messages containing a URL even if they are in Japanese", () => {
    // 提供元のエラーはリンクを含むことが多い。私たちの文言にリンクは入れない
    expect(
      normalizeUserFacingGenerationError(
        "failed",
        "残高がありません https://platform.openai.com/settings/organization/billing/",
        copy,
      ),
    ).toBe(copy.genericGenerationFailed);
  });

  describe("請求で止まったとき（2026-08-31 の障害）", () => {
    /*
      提供元は接頭辞なしの生文字列で返し、しかも文言が変わる。
      hard limit だけを潰していたため、残高切れの文言が素通りし、
      ユーザーに「あなたが課金してください」と読める英文と
      当社の請求ページ URL が表示された。
    */
    it("maps 'no credits remaining' to copy.providerBusy", () => {
      expect(
        normalizeUserFacingGenerationError(
          "failed",
          "You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.",
          copy,
        ),
      ).toBe(copy.providerBusy);
    });

    it("maps 'insufficient_quota' to copy.providerBusy", () => {
      expect(
        normalizeUserFacingGenerationError(
          "failed",
          "429 insufficient_quota: You exceeded your current quota",
          copy,
        ),
      ).toBe(copy.providerBusy);
    });

    it("keeps mapping the previous wording (billing hard limit)", () => {
      expect(
        normalizeUserFacingGenerationError(
          "failed",
          "Billing hard limit has been reached.",
          copy,
        ),
      ).toBe(copy.providerBusy);
    });

    it("never shows the billing URL to users", () => {
      const result = normalizeUserFacingGenerationError(
        "failed",
        "You have no credits remaining. Add credits at https://platform.openai.com/settings/organization/billing/.",
        copy,
      );
      expect(result).not.toContain("openai.com");
      expect(result).not.toContain("credits");
    });
  });
});
