import { z } from "zod";
import {
  REPORT_CATEGORY_IDS,
  REPORT_SUBCATEGORY_IDS,
  isValidReportSubcategory,
} from "@/constants/report-taxonomy";

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

export const moderationDecisionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().max(300).optional(),
});
