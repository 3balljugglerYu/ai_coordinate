/** @jest-environment node */

import {
  SUBMISSION_SOURCES,
  submissionConsentsSchema,
  creatorLooksFieldsSchema,
  isAllConsentsAcknowledged,
  buildSubmissionConsents,
  SUBMISSION_CONSENTS_VERSION,
} from "@/features/inspire/lib/creator-looks-submission";

describe("SUBMISSION_SOURCES", () => {
  test("self_created のみ受け付ける (= 本人 AI 生成 / 制作)", () => {
    expect(SUBMISSION_SOURCES).toEqual(["self_created"]);
  });
});

describe("submissionConsentsSchema", () => {
  test("5 項目すべて true + version で valid", () => {
    const result = submissionConsentsSchema.safeParse({
      copyright: true,
      third_party_ip: true,
      secondary_use: true,
      promo_use: true,
      no_sensitive: true,
      version: "1.0",
    });
    expect(result.success).toBe(true);
  });

  test("1 項目でも false なら invalid (= z.literal(true) で reject)", () => {
    const result = submissionConsentsSchema.safeParse({
      copyright: true,
      third_party_ip: true,
      secondary_use: false,
      promo_use: true,
      no_sensitive: true,
      version: "1.0",
    });
    expect(result.success).toBe(false);
  });

  test("項目欠落は invalid", () => {
    const result = submissionConsentsSchema.safeParse({
      copyright: true,
      third_party_ip: true,
      secondary_use: true,
      promo_use: true,
      version: "1.0",
      // no_sensitive missing
    });
    expect(result.success).toBe(false);
  });

  test("不明なキー (例: extra_field) は strict() により reject", () => {
    const result = submissionConsentsSchema.safeParse({
      copyright: true,
      third_party_ip: true,
      secondary_use: true,
      promo_use: true,
      no_sensitive: true,
      version: "1.0",
      extra_field: "x",
    });
    expect(result.success).toBe(false);
  });
});

describe("creatorLooksFieldsSchema", () => {
  test("is_creator_looks=true + source + consents で valid", () => {
    const result = creatorLooksFieldsSchema.safeParse({
      is_creator_looks: true,
      submission_source: "self_created",
      submission_consents: {
        copyright: true,
        third_party_ip: true,
        secondary_use: true,
        promo_use: true,
        no_sensitive: true,
        version: "1.0",
      },
    });
    expect(result.success).toBe(true);
  });

  test("is_creator_looks=false は invalid (= literal(true) で reject)", () => {
    const result = creatorLooksFieldsSchema.safeParse({
      is_creator_looks: false,
      submission_source: "self_created",
      submission_consents: {
        copyright: true,
        third_party_ip: true,
        secondary_use: true,
        promo_use: true,
        no_sensitive: true,
        version: "1.0",
      },
    });
    expect(result.success).toBe(false);
  });

  test("submission_source が ENUM 外なら invalid", () => {
    const result = creatorLooksFieldsSchema.safeParse({
      is_creator_looks: true,
      submission_source: "unknown",
      submission_consents: {
        copyright: true,
        third_party_ip: true,
        secondary_use: true,
        promo_use: true,
        no_sensitive: true,
        version: "1.0",
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("isAllConsentsAcknowledged", () => {
  test("5 項目すべて true なら true", () => {
    expect(
      isAllConsentsAcknowledged({
        copyright: true,
        third_party_ip: true,
        secondary_use: true,
        promo_use: true,
        no_sensitive: true,
      }),
    ).toBe(true);
  });

  test("1 項目でも false なら false", () => {
    expect(
      isAllConsentsAcknowledged({
        copyright: true,
        third_party_ip: true,
        secondary_use: false,
        promo_use: true,
        no_sensitive: true,
      }),
    ).toBe(false);
  });

  test("項目欠落も false", () => {
    expect(
      isAllConsentsAcknowledged({
        copyright: true,
      }),
    ).toBe(false);
  });

  test("空 object は false (= 入力途中の partial state でも安全)", () => {
    expect(isAllConsentsAcknowledged({})).toBe(false);
  });
});

describe("buildSubmissionConsents", () => {
  test("5 項目を含む payload を組み立て、version と acknowledged_at が付与される", () => {
    const result = buildSubmissionConsents({
      copyright: true,
      third_party_ip: true,
      secondary_use: true,
      promo_use: true,
      no_sensitive: true,
    });
    expect(result.copyright).toBe(true);
    expect(result.third_party_ip).toBe(true);
    expect(result.secondary_use).toBe(true);
    expect(result.promo_use).toBe(true);
    expect(result.no_sensitive).toBe(true);
    expect(result.version).toBe(SUBMISSION_CONSENTS_VERSION);
    expect(typeof result.acknowledged_at).toBe("string");
    // ISO 8601 形式
    expect(result.acknowledged_at!).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("出力は submissionConsentsSchema に valid", () => {
    const result = buildSubmissionConsents({
      copyright: true,
      third_party_ip: true,
      secondary_use: true,
      promo_use: true,
      no_sensitive: true,
    });
    expect(submissionConsentsSchema.safeParse(result).success).toBe(true);
  });
});
