/** @jest-environment node */

import {
  checkAndConsumeGuestGenerateRateLimit,
  releaseGuestGenerateRateLimitAttempt,
} from "@/features/generation/lib/guest-rate-limit";
import {
  checkAndConsumeStyleGenerateRateLimit,
  releaseStyleGenerateRateLimitAttempt,
} from "@/features/style/lib/style-rate-limit";

describe("guest-rate-limit", () => {
  test("style rate-limit 実装を guest 用 alias として再 export する", () => {
    expect(checkAndConsumeGuestGenerateRateLimit).toBe(
      checkAndConsumeStyleGenerateRateLimit
    );
    expect(releaseGuestGenerateRateLimitAttempt).toBe(
      releaseStyleGenerateRateLimitAttempt
    );
  });
});
