import { z } from "zod";
import {
  REPORT_CATEGORY_IDS,
  REPORT_SUBCATEGORY_IDS,
  isValidReportSubcategory,
} from "@/constants/report-taxonomy";
import { isValidModerationPolicyCode } from "@/constants/moderation-policy";

export const reportPostSchema = z
  .object({
    postId: z.string().uuid("Invalid postId"),
    categoryId: z.enum(REPORT_CATEGORY_IDS as [string, ...string[]], {
      message: "Invalid categoryId",
    }),
    subcategoryId: z.enum(REPORT_SUBCATEGORY_IDS as [string, ...string[]], {
      message: "Invalid subcategoryId",
    }),
    details: z
      .string()
      .max(300, "details must be at most 300 characters")
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (!isValidReportSubcategory(value.categoryId, value.subcategoryId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "subcategoryId does not belong to categoryId",
        path: ["subcategoryId"],
      });
    }
  });

/**
 * 審査キューからの判定。
 *
 * 設計判断: ADR-011 / REQ-024
 * - reject 時は執行ポリシーと「投稿者に見せる説明」を必須にする（説明責任）
 * - `internalNote` は運営内部メモで、投稿者向けレスポンスには決して載せない
 * - `idempotencyKey` は UI が操作開始時に生成し、同じ送信の再試行で再利用する
 */
export const moderationDecisionSchema = z
  .object({
    action: z.enum(["approve", "reject"]),
    idempotencyKey: z.string().uuid("Invalid idempotencyKey"),
    policyCode: z.string().max(120).optional(),
    authorFacingReason: z
      .string()
      .max(1000, "authorFacingReason must be at most 1000 characters")
      .optional(),
    internalNote: z
      .string()
      .max(1000, "internalNote must be at most 1000 characters")
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action !== "reject") {
      return;
    }
    if (!value.policyCode || !isValidModerationPolicyCode(value.policyCode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "policyCode is required and must exist in the policy catalog",
        path: ["policyCode"],
      });
    }
    if (!value.authorFacingReason || value.authorFacingReason.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "authorFacingReason is required when rejecting",
        path: ["authorFacingReason"],
      });
    }
  });

/**
 * 投稿者からの異議申立て。対象は投稿ではなく個々の削除判定 (ADR-004)。
 */
export const createAppealSchema = z.object({
  moderationDecisionId: z.string().uuid("Invalid moderationDecisionId"),
  body: z
    .string()
    .trim()
    .min(1, "body is required")
    .max(1000, "body must be at most 1000 characters"),
});

/**
 * 異議申立ての判定。
 *
 * uphold    = 元の公開停止を支持する（UI の「棄却する」。投稿は removed のまま）
 * overturn  = 元の判定を覆す（UI の「認める」。投稿を visible に復帰）
 *
 * 日本語ラベルと取り違えないこと。
 */
export const appealDecisionSchema = z.object({
  action: z.enum(["uphold", "overturn"]),
  note: z
    .string()
    .trim()
    .min(1, "note is required")
    .max(500, "note must be at most 500 characters"),
  independenceExceptionReason: z
    .string()
    .trim()
    .max(500, "independenceExceptionReason must be at most 500 characters")
    .optional(),
});
