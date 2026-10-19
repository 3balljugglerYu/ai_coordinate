import { z } from "zod";
import {
  PERSONAL_NOTICE_BODY_MAX,
  PERSONAL_NOTICE_CODE_PLACEHOLDER,
  PERSONAL_NOTICE_CODE_PREFIX_PATTERN,
  PERSONAL_NOTICE_MEMO_MAX,
  PERSONAL_NOTICE_TITLE_MAX,
  bodyUsesReceiptCode,
  countChars,
} from "./constants";

/** 宛先は貼った文のまま受け取り、サーバーで確かめ直す */
export const recipientTextSchema = z.string().max(100_000, "宛先が長すぎます");

function requiredText(label: string, max: number) {
  return z
    .string()
    .refine((v) => v.trim().length > 0, { message: `${label}を入力してください` })
    .refine((v) => countChars(v.trim()) <= max, {
      message: `${label}は${max}文字以内で入力してください`,
    });
}

export const sendPersonalNoticeSchema = z
  .object({
    recipients_text: recipientTextSchema,
    memo: requiredText("管理用のメモ", PERSONAL_NOTICE_MEMO_MAX),
    title: requiredText("題名", PERSONAL_NOTICE_TITLE_MAX).refine(
      (v) => !v.includes(PERSONAL_NOTICE_CODE_PLACEHOLDER),
      { message: "{受付番号} は本文にだけ入れられます" }
    ),
    body: requiredText("本文", PERSONAL_NOTICE_BODY_MAX),
    code_prefix: z.string().trim().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (!bodyUsesReceiptCode(value.body)) return;
    const prefix = value.code_prefix ?? "";
    if (!prefix) {
      ctx.addIssue({
        code: "custom",
        path: ["code_prefix"],
        message: "本文に {受付番号} があるときは、頭の英字を入れてください",
      });
    } else if (!PERSONAL_NOTICE_CODE_PREFIX_PATTERN.test(prefix)) {
      ctx.addIssue({
        code: "custom",
        path: ["code_prefix"],
        message: "頭の英字は英大文字2〜5文字で入力してください",
      });
    }
  });

export type SendPersonalNoticeInput = z.infer<typeof sendPersonalNoticeSchema>;
