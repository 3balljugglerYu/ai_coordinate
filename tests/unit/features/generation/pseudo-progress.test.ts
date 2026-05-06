import {
  PSEUDO_INITIAL_PROGRESS,
  PSEUDO_LONG_WAIT_THRESHOLD_MS,
  calculatePseudoProgress,
} from "@/features/generation/lib/pseudo-progress";

describe("calculatePseudoProgress", () => {
  test("経過時間が 0 以下の場合は初期値を返す", () => {
    expect(calculatePseudoProgress(0)).toBe(PSEUDO_INITIAL_PROGRESS);
    expect(calculatePseudoProgress(-100)).toBe(PSEUDO_INITIAL_PROGRESS);
  });

  test("各フェーズで単調に進み、長時間後は 94 で頭打ちする", () => {
    const early = calculatePseudoProgress(3000);
    const middle = calculatePseudoProgress(10000);
    const late = calculatePseudoProgress(PSEUDO_LONG_WAIT_THRESHOLD_MS);
    const capped = calculatePseudoProgress(30000);

    expect(early).toBeGreaterThan(PSEUDO_INITIAL_PROGRESS);
    expect(middle).toBeGreaterThan(early);
    expect(late).toBeGreaterThan(middle);
    expect(capped).toBe(94);
    expect(calculatePseudoProgress(60000)).toBe(94);
  });
});
