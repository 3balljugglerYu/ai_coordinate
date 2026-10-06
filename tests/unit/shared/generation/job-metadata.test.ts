/** @jest-environment node */

import {
  mergeSuccessGenerationMetadata,
  stripNameInputFromMetadata,
} from "@/shared/generation/job-metadata";

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
  test("ガチャで選ばれた番号を残す（使っていない生成ではキーを足さない）", () => {
    const withGacha = mergeSuccessGenerationMetadata({
      jobGenerationMetadata: { outputAspectRatioMode: "source" },
      geminiAttempts: [],
      gachaPicks: [{ number: 7, total: 17 }],
    });
    expect(withGacha.gachaPicks).toEqual([{ number: 7, total: 17 }]);
    expect(withGacha.outputAspectRatioMode).toBe("source");

    for (const gachaPicks of [undefined, []]) {
      const merged = mergeSuccessGenerationMetadata({
        jobGenerationMetadata: null,
        geminiAttempts: [],
        gachaPicks,
      });
      expect("gachaPicks" in merged).toBe(false);
    }
  });
});

describe("名前の欄の名前を投稿側へ写さない", () => {
  test("成功時は名前そのものを消し、使ったことだけを残す", () => {
    const merged = mergeSuccessGenerationMetadata({
      jobGenerationMetadata: { nameInput: "ぺるこ", outputAspectRatioMode: "3:4" },
      geminiAttempts: [],
      nameInputUsed: true,
    });
    expect(merged).not.toHaveProperty("nameInput");
    expect(merged).toMatchObject({ nameInputUsed: true, outputAspectRatioMode: "3:4" });
  });

  test("名前を使っていなければ nameInputUsed を足さない", () => {
    const merged = mergeSuccessGenerationMetadata({
      jobGenerationMetadata: { nameInput: "ぺるこ" },
      geminiAttempts: [],
    });
    expect(merged).not.toHaveProperty("nameInput");
    expect(merged).not.toHaveProperty("nameInputUsed");
  });

  test("stripNameInputFromMetadata は名前だけを取り除く", () => {
    expect(stripNameInputFromMetadata({ nameInput: "x", framingMode: "free" })).toEqual({ framingMode: "free" });
    expect(stripNameInputFromMetadata(null)).toEqual({});
  });
});

