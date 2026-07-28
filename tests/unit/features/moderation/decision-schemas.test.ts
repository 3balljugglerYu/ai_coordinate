/** @jest-environment node */

/**
 * 判定・異議申立てスキーマの検証。
 *
 * 設計判断: docs/planning/post-moderation-notification-implementation-plan.md
 *           ADR-003, ADR-011 / REQ-024
 *
 * reject 時に「執行ポリシー」と「投稿者に見せる説明」を必須にすることで、
 * 無言削除と説明なし削除を構造的に防ぐ。
 */

import {
  appealDecisionSchema,
  createAppealSchema,
  moderationDecisionSchema,
} from "@/features/moderation/lib/schemas";
import {
  MODERATION_POLICY_CATALOG,
  findModerationPolicy,
  shouldHideThumbnailForPolicy,
} from "@/constants/moderation-policy";

const IDEMPOTENCY_KEY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DECISION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("moderationDecisionSchema", () => {
  it("reject は policyCode と authorFacingReason の両方が必須", () => {
    const missingBoth = moderationDecisionSchema.safeParse({
      action: "reject",
      idempotencyKey: IDEMPOTENCY_KEY,
    });
    expect(missingBoth.success).toBe(false);

    const missingReason = moderationDecisionSchema.safeParse({
      action: "reject",
      idempotencyKey: IDEMPOTENCY_KEY,
      policyCode: "rights.copyright",
    });
    expect(missingReason.success).toBe(false);

    const missingPolicy = moderationDecisionSchema.safeParse({
      action: "reject",
      idempotencyKey: IDEMPOTENCY_KEY,
      authorFacingReason: "著作権侵害のため公開停止しました",
    });
    expect(missingPolicy.success).toBe(false);
  });

  it("reject の authorFacingReason は空白のみを許さない", () => {
    const result = moderationDecisionSchema.safeParse({
      action: "reject",
      idempotencyKey: IDEMPOTENCY_KEY,
      policyCode: "rights.copyright",
      authorFacingReason: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("カタログに存在しない policyCode を拒否する", () => {
    const result = moderationDecisionSchema.safeParse({
      action: "reject",
      idempotencyKey: IDEMPOTENCY_KEY,
      policyCode: "does.not.exist",
      authorFacingReason: "理由",
    });
    expect(result.success).toBe(false);
  });

  it("有効な reject を受理し、internalNote は任意", () => {
    const withNote = moderationDecisionSchema.safeParse({
      action: "reject",
      idempotencyKey: IDEMPOTENCY_KEY,
      policyCode: "rights.copyright",
      authorFacingReason: "著作権侵害のため公開停止しました",
      internalNote: "再犯2回目",
    });
    expect(withNote.success).toBe(true);

    const withoutNote = moderationDecisionSchema.safeParse({
      action: "reject",
      idempotencyKey: IDEMPOTENCY_KEY,
      policyCode: "rights.copyright",
      authorFacingReason: "著作権侵害のため公開停止しました",
    });
    expect(withoutNote.success).toBe(true);
  });

  it("approve は policyCode / authorFacingReason を省略できる", () => {
    const result = moderationDecisionSchema.safeParse({
      action: "approve",
      idempotencyKey: IDEMPOTENCY_KEY,
    });
    expect(result.success).toBe(true);
  });

  it("idempotencyKey は UUID 必須（再送の吸収に使うため）", () => {
    const result = moderationDecisionSchema.safeParse({
      action: "approve",
      idempotencyKey: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});

describe("createAppealSchema", () => {
  it("投稿 ID ではなく判定 ID を受け取る", () => {
    const ok = createAppealSchema.safeParse({
      moderationDecisionId: DECISION_ID,
      body: "誤判定だと思います",
    });
    expect(ok.success).toBe(true);

    const missing = createAppealSchema.safeParse({ body: "本文" });
    expect(missing.success).toBe(false);
  });

  it("空本文を拒否する", () => {
    const result = createAppealSchema.safeParse({
      moderationDecisionId: DECISION_ID,
      body: "    ",
    });
    expect(result.success).toBe(false);
  });
});

describe("appealDecisionSchema", () => {
  it("uphold / overturn の双方で理由が必須", () => {
    for (const action of ["uphold", "overturn"] as const) {
      const missing = appealDecisionSchema.safeParse({ action });
      expect(missing.success).toBe(false);

      const blank = appealDecisionSchema.safeParse({ action, note: "  " });
      expect(blank.success).toBe(false);

      const ok = appealDecisionSchema.safeParse({ action, note: "再確認しました" });
      expect(ok.success).toBe(true);
    }
  });

  it("uphold / overturn 以外の action を拒否する", () => {
    const result = appealDecisionSchema.safeParse({
      action: "approve",
      note: "理由",
    });
    expect(result.success).toBe(false);
  });
});

describe("MODERATION_POLICY_CATALOG", () => {
  it("通報タクソノミの全サブカテゴリを網羅する", () => {
    // rights 3 + sexual 3 + violence 3 + harassment 3 + danger 3 + spam_fraud 3 + other 1
    expect(MODERATION_POLICY_CATALOG).toHaveLength(19);
    expect(findModerationPolicy("rights.copyright")).not.toBeNull();
    expect(findModerationPolicy("other.other")).not.toBeNull();
  });

  it("code は category.subcategory 形式で version と anchor を持つ", () => {
    for (const policy of MODERATION_POLICY_CATALOG) {
      expect(policy.code).toBe(`${policy.categoryId}.${policy.subcategoryId}`);
      expect(policy.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(policy.anchor).toMatch(/^guidelines-/);
    }
  });

  it("重大カテゴリはサムネイルを表示しない", () => {
    expect(shouldHideThumbnailForPolicy("sexual.minor_sexual")).toBe(true);
    expect(shouldHideThumbnailForPolicy("violence.gore")).toBe(true);
    expect(shouldHideThumbnailForPolicy("danger.self_harm")).toBe(true);
    expect(shouldHideThumbnailForPolicy("rights.copyright")).toBe(false);
  });

  it("カタログから消えた未知の code は安全側（非表示）に倒す", () => {
    expect(shouldHideThumbnailForPolicy("legacy.removed_policy")).toBe(true);
  });

  it("code なし（approve など）は非表示にしない", () => {
    expect(shouldHideThumbnailForPolicy(null)).toBe(false);
  });
});
