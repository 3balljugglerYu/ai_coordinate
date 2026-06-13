/** @jest-environment node */

import { isTutorialActiveOrPending } from "@/features/tutorial/lib/tutorial-status";

describe("isTutorialActiveOrPending (SSR / window 未定義)", () => {
  it("window が無い環境では false を返す", () => {
    expect(typeof window).toBe("undefined");
    expect(
      isTutorialActiveOrPending({
        isAuthenticated: true,
        tutorialCompleted: false,
      }),
    ).toBe(false);
  });
});
