import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { logAdminAction } from "@/lib/admin-audit";
import {
  approveCreatorStylePreset,
  rejectCreatorStylePreset,
} from "@/features/style-presets/lib/style-preset-repository";
import { revalidateStylePresets } from "@/features/style-presets/lib/revalidate-style-presets";

const decisionSchema = z.object({
  action: z.enum(["approve", "reject"]),
});

/**
 * POST /api/admin/style-presets/submissions/[id]
 *
 * admin がクリエイター提供プロンプト(pending の style_preset)を承認 / 却下する。
 * - 承認: published 化 + provider_user_id を申請者に設定(approve_creator_style_preset RPC)
 * - 却下: rejected 化(reject_creator_style_preset RPC)
 * RPC 側でも auth.uid() アンカー + admin_users 検証で二重に守る。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

  let adminUser;
  try {
    adminUser = await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) {
      return error;
    }
    throw error;
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "入力が不正です" }, { status: 400 });
  }
  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "入力が不正です" }, { status: 400 });
  }

  try {
    const result =
      parsed.data.action === "approve"
        ? await approveCreatorStylePreset(id, adminUser.id)
        : await rejectCreatorStylePreset(id, adminUser.id);

    await logAdminAction({
      adminUserId: adminUser.id,
      actionType:
        parsed.data.action === "approve"
          ? "creator_style_preset_approve"
          : "creator_style_preset_reject",
      targetType: "style_preset",
      targetId: id,
    });

    // 承認時は公開され /style・ホームに反映されるためキャッシュ無効化。
    revalidateStylePresets();

    return NextResponse.json({ id: result.id, status: result.status });
  } catch (error) {
    console.error("[admin creator-prompt decision] error:", error);
    return NextResponse.json(
      { error: "処理に失敗しました" },
      { status: 500 }
    );
  }
}
