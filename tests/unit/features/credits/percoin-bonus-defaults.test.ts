/**
 * features/credits/lib/percoin-bonus-defaults のテスト。
 *
 * /admin/percoin-defaults の付与額設定は source ごとに許容範囲が違う:
 *   - 従来のボーナス(登録・ツアー・紹介・デイリー): 1〜1000
 *   - クリエイター還元(prompt_usage_reward / style_usage_reward): 0〜5
 *   - 日次ミッション(prompt_use_daily): 0〜1000
 *
 * 還元の上限5は経済的な不変条件（付与額 < 1生成の最低コスト10）を保つための
 * 制限で、API・管理フォーム・DB CHECK(20260806150000) の3箇所で同じ規則を使う。
 */
import {
  BONUS_SOURCES,
  DAILY_MISSION_BONUS_SOURCES,
  DAILY_MISSION_MAX_AMOUNT,
  isDailyMissionBonusSource,
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
  test("BONUS_SOURCES は従来4種 + 還元2種 + 投稿4種 + 日次ミッション1種", () => {
    expect(BONUS_SOURCES).toHaveLength(11);
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

  describe("日次ミッション(prompt_use_daily)", () => {
    test("還元の上限5ではなく 0〜1000 を使う", () => {
      /*
        還元の上限5は「利用のたびに無制限に発生する」ことに由来する制限
        (2アカウントで使い合うと生成のたびに残高が増えるため)。
        日次ミッションは UNIQUE(user_id, jst_date) で頻度が1日1回に締まるので
        同じ上限は当てはまらない。ここを取り違えると 20pc が保存できない。
      */
      expect(DAILY_MISSION_BONUS_SOURCES).toEqual(["prompt_use_daily"]);
      expect(getBonusAmountRange("prompt_use_daily")).toEqual({
        min: 0,
        max: DAILY_MISSION_MAX_AMOUNT,
      });
      expect(DAILY_MISSION_MAX_AMOUNT).toBeGreaterThan(USAGE_REWARD_MAX_AMOUNT);
    });

    test("DB の CHECK と同じ範囲になっている", () => {
      /*
        percoin_bonus_defaults_source_amount_check は source ごとに範囲が違う。
        アプリ側の範囲がずれると、保存できるはずの値が 23514 で弾かれる
        (migration で prompt_use_daily を 0〜1000 の枠に足している)。
      */
      expect(getBonusAmountRange("prompt_use_daily")).toEqual({
        min: 0,
        max: 1000,
      });
    });

    test("運営が決めた 20pc を保存できる", () => {
      expect(validateBonusAmount("prompt_use_daily", 20)).toBeNull();
    });

    test("0 で停止できる", () => {
      expect(validateBonusAmount("prompt_use_daily", 0)).toBeNull();
    });

    test("上限超過と小数は弾く", () => {
      expect(validateBonusAmount("prompt_use_daily", 1001)).not.toBeNull();
      expect(validateBonusAmount("prompt_use_daily", 1.5)).not.toBeNull();
    });

    test("還元 source とは別物として判定される", () => {
      expect(isDailyMissionBonusSource("prompt_use_daily")).toBe(true);
      expect(isDailyMissionBonusSource("prompt_usage_reward")).toBe(false);
      expect(isUsageRewardBonusSource("prompt_use_daily")).toBe(false);
    });
  });
});