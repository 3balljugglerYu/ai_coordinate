/**
 * features/credits/lib/percoin-bonus-defaults のテスト。
 *
 * /admin/percoin-defaults の付与額設定は source ごとに許容範囲が違う:
 *   - 従来のボーナス(登録・ツアー・紹介・デイリー): 1〜1000
 *   - クリエイター還元(prompt_usage_reward / style_usage_reward): 0〜5
 *
 * 還元の上限5は経済的な不変条件（付与額 < 1生成の最低コスト10）を保つための
 * 制限で、API・管理フォーム・DB CHECK(20260806150000) の3箇所で同じ規則を使う。
 */
import {
  BONUS_SOURCES,
  CLASSIC_BONUS_SOURCES,
  USAGE_REWARD_BONUS_SOURCES,
  USAGE_REWARD_MAX_AMOUNT,
  getBonusAmountRange,
  isUsageRewardBonusSource,
  validateBonusAmount,
  POST_BONUS_SOURCES,
  getPostBonusSource,
} from "@/features/credits/lib/percoin-bonus-defaults";

describe("percoin-bonus-defaults", () => {
  test("BONUS_SOURCES は従来4種 + 還元2種 + 投稿4種", () => {
    expect(BONUS_SOURCES).toHaveLength(10);
    expect(CLASSIC_BONUS_SOURCES).toEqual([
      "signup_bonus",
      "tour_bonus",
      "referral",
      "daily_post",
    ]);
    expect(USAGE_REWARD_BONUS_SOURCES).toEqual([
      "prompt_usage_reward",
      "style_usage_reward",
    ]);
    expect(POST_BONUS_SOURCES).toEqual([
      "daily_post_one_tap",
      "daily_post_free",
      "daily_post_coordinate",
      "daily_post_inspire",
    ]);
  });

  test("投稿ボーナスは0を許す(0=その生成方法には付与しない)", () => {
    // CLASSIC は最小1なので、この分類が無いとコーデを停止できない
    expect(getBonusAmountRange("daily_post_coordinate")).toEqual({
      min: 0,
      max: 1000,
    });
    expect(validateBonusAmount("daily_post_coordinate", 0)).toBeNull();
    expect(validateBonusAmount("daily_post", 0)).not.toBeNull();
  });

  test("生成方法から source を引ける(未対応は null)", () => {
    expect(getPostBonusSource("one_tap_style")).toBe("daily_post_one_tap");
    expect(getPostBonusSource("free")).toBe("daily_post_free");
    expect(getPostBonusSource("coordinate")).toBe("daily_post_coordinate");
    expect(getPostBonusSource("unknown")).toBeNull();
    expect(getPostBonusSource(null)).toBeNull();
  });

  describe("isUsageRewardBonusSource", () => {
    test.each(USAGE_REWARD_BONUS_SOURCES)("%s は還元", (source) => {
      expect(isUsageRewardBonusSource(source)).toBe(true);
    });

    test.each(CLASSIC_BONUS_SOURCES)("%s は還元ではない", (source) => {
      expect(isUsageRewardBonusSource(source)).toBe(false);
    });

    test("未知の source は還元ではない", () => {
      expect(isUsageRewardBonusSource("unknown_source")).toBe(false);
    });
  });

  describe("getBonusAmountRange", () => {
    test("還元は 0〜5", () => {
      expect(getBonusAmountRange("prompt_usage_reward")).toEqual({
        min: 0,
        max: 5,
      });
      expect(getBonusAmountRange("style_usage_reward")).toEqual({
        min: 0,
        max: 5,
      });
    });

    test("従来ボーナスは 1〜1000", () => {
      expect(getBonusAmountRange("signup_bonus")).toEqual({
        min: 1,
        max: 1000,
      });
    });

    test("上限5は最低生成コスト(10)より小さい", () => {
      // 2アカウントの相互利用でも系が純減する経済的な不変条件
      expect(USAGE_REWARD_MAX_AMOUNT).toBeLessThan(10);
    });
  });

  describe("validateBonusAmount（還元）", () => {
    test.each([0, 1, 2, 5])("%i は許可（0は付与しないの意味）", (amount) => {
      expect(validateBonusAmount("prompt_usage_reward", amount)).toBeNull();
      expect(validateBonusAmount("style_usage_reward", amount)).toBeNull();
    });

    test.each([6, 10, 1000, -1])("%i は拒否", (amount) => {
      expect(validateBonusAmount("prompt_usage_reward", amount)).not.toBeNull();
      expect(validateBonusAmount("style_usage_reward", amount)).not.toBeNull();
    });

    test("小数は拒否", () => {
      expect(validateBonusAmount("prompt_usage_reward", 1.5)).not.toBeNull();
    });
  });

  describe("validateBonusAmount（従来ボーナス）", () => {
    test.each([1, 500, 1000])("%i は許可", (amount) => {
      expect(validateBonusAmount("signup_bonus", amount)).toBeNull();
    });

    test.each([0, 1001, -1])("%i は拒否（0にはできない）", (amount) => {
      expect(validateBonusAmount("signup_bonus", amount)).not.toBeNull();
    });

    test("エラーメッセージに source と範囲が含まれる", () => {
      expect(validateBonusAmount("daily_post", 0)).toContain("daily_post");
      expect(validateBonusAmount("daily_post", 0)).toContain("1〜1000");
      expect(validateBonusAmount("style_usage_reward", 6)).toContain("0〜5");
    });
  });
});
