import { connection, NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { TWO_STAGE_VISIBILITY_KEY } from "@/features/inspire/lib/creator-looks-two-stage";

/**
 * PATCH /api/admin/creator-looks-two-stage
 * Creator Looks「2段階(衣装＋背景)生成モード」の公開レベルを更新する。
 * app_settings.key='creator_looks_two_stage_visibility' を upsert。
 * 値は 'admin_only' | 'public'。admin のみ実行可。
 */
export async function PATCH(request: NextRequest) {
  await connection();

  // CSRF 防御 (cookie 認証 mutation route)
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

  let admin;
  try {
    admin = await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) {
      return error;
    }
    throw error;
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw =
    body && typeof body === "object"
      ? (body as Record<string, unknown>).visibility
      : null;
  if (raw !== "admin_only" && raw !== "public") {
    return NextResponse.json(
      { error: "visibility must be 'admin_only' or 'public'" },
      { status: 400 },
    );
  }
  const visibility = raw;

  const supabase = createAdminClient();
  const { error } = await supabase.from("app_settings").upsert(
    {
      key: TWO_STAGE_VISIBILITY_KEY,
      value: visibility,
      updated_by: admin.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );

  if (error) {
    console.error("[creator-looks-two-stage PATCH] upsert error:", error);
    return NextResponse.json(
      { error: "公開設定の更新に失敗しました" },
      { status: 500 },
    );
  }

  await logAdminAction({
    adminUserId: admin.id,
    actionType: "creator_looks_two_stage_visibility_update",
    targetType: "app_settings",
    metadata: { key: TWO_STAGE_VISIBILITY_KEY, visibility },
  });

  return NextResponse.json({ success: true });
}
