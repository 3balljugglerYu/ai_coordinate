/** @jest-environment node */

import { mergeSuccessGenerationMetadata } from "@/shared/generation/job-metadata";

describe("mergeSuccessGenerationMetadata", () => {
  test("geminiAttempts を追記しても job 側の outputAspectRatioMode が保持される", () => {
    const merged = mergeSuccessGenerationMetadata({
      jobGenerationMetadata: { outputAspectRatioMode: "3:4" },
      geminiAttempts: [{ attempt: 1 }],
    });
    expect(merged).toEqual(
      expect.objectContaining({
        outputAspectRatioMode: "3:4",
        geminiAttempts: [{ attempt: 1 }],
      }),
    );
  });

  test("他のキー(framingMode / creatorLooksMode)も同時に保持される", () => {
    const merged = mergeSuccessGenerationMetadata({
      jobGenerationMetadata: {
        outputAspectRatioMode: "16:9",
        framingMode: "free_pose",
        creatorLooksMode: "outfit_only",
      },
      geminiAttempts: [],
    });
    expect(merged.outputAspectRatioMode).toBe("16:9");
    expect(merged.framingMode).toBe("free_pose");
    expect(merged.creatorLooksMode).toBe("outfit_only");
  });

  test("job 側が null / undefined でも追記結果を返す", () => {
    for (const empty of [null, undefined]) {
      const merged = mergeSuccessGenerationMetadata({
        jobGenerationMetadata: empty,
        geminiAttempts: [{ attempt: 2 }],
      });
      expect(merged).toEqual({ geminiAttempts: [{ attempt: 2 }] });
    }
  });

  test("元の job metadata を破壊しない(新しいオブジェクトを返す)", () => {
    const original = { outputAspectRatioMode: "1:1" };
    const merged = mergeSuccessGenerationMetadata({
      jobGenerationMetadata: original,
      geminiAttempts: [],
    });
    expect(merged).not.toBe(original);
    expect(original).toEqual({ outputAspectRatioMode: "1:1" });
  });
});
