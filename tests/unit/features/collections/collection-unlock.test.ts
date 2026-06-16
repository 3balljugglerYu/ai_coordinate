import {
  computeUnlockedCount,
  isPresetUnlocked,
} from "@/features/collections/lib/collection-unlock";

describe("collection-unlock", () => {
  describe("computeUnlockedCount", () => {
    test("仕様の例表(batch=2, total=6)どおりに段階解放する", () => {
      expect(computeUnlockedCount(0, 2, 6)).toBe(2);
      expect(computeUnlockedCount(1, 2, 6)).toBe(2);
      expect(computeUnlockedCount(2, 2, 6)).toBe(4);
      expect(computeUnlockedCount(3, 2, 6)).toBe(4);
      expect(computeUnlockedCount(4, 2, 6)).toBe(6);
      expect(computeUnlockedCount(5, 2, 6)).toBe(6);
      expect(computeUnlockedCount(6, 2, 6)).toBe(6);
    });

    test("distinct が total を超えても total を超えない(クランプ)", () => {
      expect(computeUnlockedCount(100, 2, 6)).toBe(6);
    });

    test("batch が null なら一括解放(total を返す)", () => {
      expect(computeUnlockedCount(0, null, 6)).toBe(6);
      expect(computeUnlockedCount(3, null, 6)).toBe(6);
    });

    test("batch が 0 / 負なら一括解放(total を返す)", () => {
      expect(computeUnlockedCount(0, 0, 6)).toBe(6);
      expect(computeUnlockedCount(2, -1, 6)).toBe(6);
    });

    test("total が 0 / 負なら解放数 0", () => {
      expect(computeUnlockedCount(0, 2, 0)).toBe(0);
      expect(computeUnlockedCount(5, null, 0)).toBe(0);
      expect(computeUnlockedCount(5, 2, -3)).toBe(0);
    });

    test("batch=1 なら distinct+1 を total でクランプ", () => {
      expect(computeUnlockedCount(0, 1, 6)).toBe(1);
      expect(computeUnlockedCount(1, 1, 6)).toBe(2);
      expect(computeUnlockedCount(5, 1, 6)).toBe(6);
      expect(computeUnlockedCount(10, 1, 6)).toBe(6);
    });

    test("batch が total を超える場合も total でクランプ", () => {
      expect(computeUnlockedCount(0, 10, 6)).toBe(6);
    });

    test("負の distinct は 0 とみなす(防御的)", () => {
      expect(computeUnlockedCount(-5, 2, 6)).toBe(2);
    });

    test("非整数の distinct は floor して扱う", () => {
      expect(computeUnlockedCount(2.9, 2, 6)).toBe(4);
    });
  });

  describe("isPresetUnlocked", () => {
    test("batch=2, total=6, distinct=2 のとき index 0..3 が解放、4..5 はロック", () => {
      const distinct = 2; // unlockedCount = 4
      expect(isPresetUnlocked(0, distinct, 2, 6)).toBe(true);
      expect(isPresetUnlocked(1, distinct, 2, 6)).toBe(true);
      expect(isPresetUnlocked(2, distinct, 2, 6)).toBe(true);
      expect(isPresetUnlocked(3, distinct, 2, 6)).toBe(true);
      expect(isPresetUnlocked(4, distinct, 2, 6)).toBe(false);
      expect(isPresetUnlocked(5, distinct, 2, 6)).toBe(false);
    });

    test("batch=null なら全 index が解放", () => {
      for (let i = 0; i < 6; i += 1) {
        expect(isPresetUnlocked(i, 0, null, 6)).toBe(true);
      }
    });

    test("distinct=0, batch=2 なら index 0,1 のみ解放", () => {
      expect(isPresetUnlocked(0, 0, 2, 6)).toBe(true);
      expect(isPresetUnlocked(1, 0, 2, 6)).toBe(true);
      expect(isPresetUnlocked(2, 0, 2, 6)).toBe(false);
    });
  });
});
