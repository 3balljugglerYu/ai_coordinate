import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { recipientTextSchema } from "@/features/personal-notices/lib/schema";
import { resolveRecipientsText } from "@/features/personal-notices/lib/api-shared";

const lookupSchema = z.object({ recipients_text: recipientTextSchema });

/**
 * 個人あてのお知らせの宛先を確かめる(送る前の確認。何も書き込まない)。
 * 計画書 docs/planning/personal-notices-implementation-plan.md Phase 2
 */
export async function POST(request: NextRequest) {
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

  try {
    await requireAdmin();

    const parsed = lookupSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "入力内容が不正です" },
        { status: 400 }
      );
    }

    const result = await resolveRecipientsText(parsed.data.recipients_text);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ rows: result.rows });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    console.error("[Admin PersonalNotices] lookup error:", error);
    return NextResponse.json(
      { error: "宛先の確認に失敗しました" },
      { status: 500 }
    );
  }
}
