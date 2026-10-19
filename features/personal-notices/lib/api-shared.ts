import "server-only";

import { splitRecipientLines } from "./parse-recipient-line";
import { PERSONAL_NOTICE_MAX_RECIPIENTS } from "./constants";
import { recipientLookupErrorMessage } from "./messages";
import {
  lookupPersonalNoticeRecipients,
  type RecipientLookupRow,
} from "./repository";

export type RecipientLookupRowResponse = RecipientLookupRow & {
  errorMessage: string | null;
};

export type ResolveRecipientsResult =
  | { ok: true; rows: RecipientLookupRowResponse[] }
  | { ok: false; error: string };

/** 貼った文 → 行ごとの確認結果(確かめるボタンと送るときの両方で使う) */
export async function resolveRecipientsText(
  text: string
): Promise<ResolveRecipientsResult> {
  const lines = splitRecipientLines(text);
  if (lines.length === 0) {
    return { ok: false, error: "宛先を1行以上入力してください" };
  }
  if (lines.length > PERSONAL_NOTICE_MAX_RECIPIENTS) {
    return {
      ok: false,
      error: `宛先は${PERSONAL_NOTICE_MAX_RECIPIENTS}人までです(${lines.length}行あります)`,
    };
  }

  const rows = await lookupPersonalNoticeRecipients(lines);
  return {
    ok: true,
    rows: rows.map((row) => ({
      ...row,
      errorMessage: row.error
        ? recipientLookupErrorMessage(row.error, row.duplicateOfLine)
        : null,
    })),
  };
}
