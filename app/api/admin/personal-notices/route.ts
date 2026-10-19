import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { logAdminAction } from "@/lib/admin-audit";
import { sendPersonalNoticeSchema } from "@/features/personal-notices/lib/schema";
import { bodyUsesReceiptCode } from "@/features/personal-notices/lib/constants";
import { resolveRecipientsText } from "@/features/personal-notices/lib/api-shared";
import { sendPersonalNotice } from "@/features/personal-notices/lib/repository";
import { personalNoticeErrorMessage } from "@/features/personal-notices/lib/messages";

export const maxDuration = 60;

/**
 * 個人あてのお知らせを送る。宛先は貼った文をサーバーで確かめ直し、
 * 1行でも送れない行があれば何も送らない(DB の関数も同じ条件で確かめる)。
 * 計画書 docs/planning/personal-notices-implementation-plan.md PN-001〜007 / PN-014 / PN-015
 */
export async function POST(request: NextRequest) {
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

  try {
    const admin = await requireAdmin();

    const parsed = sendPersonalNoticeSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "入力内容が不正です" },
        { status: 400 }
      );
    }
    const input = parsed.data;

    const resolved = await resolveRecipientsText(input.recipients_text);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }
    if (resolved.rows.some((row) => row.error)) {
      return NextResponse.json(
        {
          error: "送れない宛先があります。直してからもう一度確かめてください",
          rows: resolved.rows,
        },
        { status: 400 }
      );
    }

    const codePrefix = bodyUsesReceiptCode(input.body)
      ? (input.code_prefix ?? null)
      : null;
    const result = await sendPersonalNotice({
      adminUserId: admin.id,
      memo: input.memo.trim(),
      title: input.title.trim(),
      body: input.body,
      codePrefix,
      recipients: resolved.rows.map((row) => ({
        recipientId: row.recipientId as string,
        postId: row.kind === "post" ? row.postId : null,
      })),
    });

    if (!result.ok) {
      const status = result.code === "PN_ADMIN_REQUIRED" ? 403 : result.code === "UNKNOWN" ? 500 : 400;
      return NextResponse.json(
        {
          error: personalNoticeErrorMessage(result.code),
          errorCode: result.code,
          line:
            result.rowIndex !== null
              ? (resolved.rows[result.rowIndex]?.line ?? null)
              : null,
        },
        { status }
      );
    }

    await logAdminAction({
      adminUserId: admin.id,
      actionType: "personal_notice_send",
      targetType: "personal_notice",
      targetId: result.noticeId,
      metadata: {
        memo: input.memo.trim(),
        recipient_count: result.recipientCount,
        code_prefix: codePrefix,
      },
    });

    return NextResponse.json({
      notice_id: result.noticeId,
      recipient_count: result.recipientCount,
    });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    console.error("[Admin PersonalNotices] send error:", error);
    return NextResponse.json(
      { error: "送れませんでした。時間をおいてもう一度お試しください" },
      { status: 500 }
    );
  }
}
