import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { logAdminAction } from "@/lib/admin-audit";
import { retractPersonalNoticeRecipient } from "@/features/personal-notices/lib/repository";
import { personalNoticeErrorMessage } from "@/features/personal-notices/lib/messages";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 1人分を取り消す。相手の通知を消し、記録は「取り消し」として残す(PN-013)。
 * 取り消し済みなら何もしない。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

  try {
    const admin = await requireAdmin();
    const { id } = await params;
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json({ error: "取り消す相手が見つかりません" }, { status: 404 });
    }

    const result = await retractPersonalNoticeRecipient({
      adminUserId: admin.id,
      recipientRowId: id,
    });
    if (!result.ok) {
      const status =
        result.code === "PN_RECIPIENT_ROW_NOT_FOUND"
          ? 404
          : result.code === "PN_ADMIN_REQUIRED"
            ? 403
            : 500;
      return NextResponse.json(
        { error: personalNoticeErrorMessage(result.code), errorCode: result.code },
        { status }
      );
    }

    if (result.retracted) {
      await logAdminAction({
        adminUserId: admin.id,
        actionType: "personal_notice_retract",
        targetType: "personal_notice_recipient",
        targetId: id,
      });
    }

    return NextResponse.json({ retracted: result.retracted });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    console.error("[Admin PersonalNotices] retract error:", error);
    return NextResponse.json({ error: "取り消しに失敗しました" }, { status: 500 });
  }
}
