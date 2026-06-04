import {
  SUBMISSION_IMAGE_MIN_DIMENSION,
  isSubmissionImageTooSmall,
} from "@/features/inspire/lib/submission-image-constraints";

describe("submission-image-constraints", () => {
  test("SUBMISSION_IMAGE_MIN_DIMENSION 定数は 768", () => {
    expect(SUBMISSION_IMAGE_MIN_DIMENSION).toBe(768);
  });

  describe("isSubmissionImageTooSmall", () => {
    test("両辺とも下限以上 (768x768) は too small ではない (= 下限境界)", () => {
      expect(isSubmissionImageTooSmall(768, 768)).toBe(false);
    });

    test("両辺とも下限超 (1024x2048) は too small ではない", () => {
      expect(isSubmissionImageTooSmall(1024, 2048)).toBe(false);
    });

    test("幅だけ下限未満 (767x768) は too small (= 片辺でも下限割れで reject)", () => {
      expect(isSubmissionImageTooSmall(767, 768)).toBe(true);
    });

    test("高さだけ下限未満 (768x767) は too small", () => {
      expect(isSubmissionImageTooSmall(768, 767)).toBe(true);
    });

    test("両辺とも下限未満 (500x500) は too small", () => {
      expect(isSubmissionImageTooSmall(500, 500)).toBe(true);
    });

    test("超横長で短辺が下限未満 (4000x300) は too small", () => {
      // 長辺は十分大きいが短辺 300 < 768 → 弾く
      expect(isSubmissionImageTooSmall(4000, 300)).toBe(true);
    });

    test("0x0 は too small", () => {
      expect(isSubmissionImageTooSmall(0, 0)).toBe(true);
    });
  });
});
