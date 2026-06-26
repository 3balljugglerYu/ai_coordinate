import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { logAdminAction } from "@/lib/admin-audit";
import {
  removeCreatorAllowlistMember,
  setCreatorAllowlistActive,
} from "@/features/creators/lib/creator-allowlist-repository";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PATCH: 有効/無効の切替({ isActive: boolean })。 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

  let adminUser;
  try {
    adminUser = await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  const { userId } = await params;
  if (!UUID_PATTERN.test(userId)) {
    return NextResponse.json({ error: "ユーザーIDが不正です" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "入力が不正です" }, { status: 400 });
  }
  const isActive = (body as { isActive?: unknown })?.isActive;
  if (typeof isActive !== "boolean") {
    return NextResponse.json(
      { error: "isActive は真偽値で指定してください" },
      { status: 400 }
    );
  }

  try {
    await setCreatorAllowlistActive(userId, isActive);
    await logAdminAction({
      adminUserId: adminUser.id,
      actionType: "creator_allowlist_update",
      targetType: "creator_looks_allowlist",
      targetId: userId,
      metadata: { isActive },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin creator-allowlist] PATCH error:", error);
    return NextResponse.json(
      { error: "招待クリエイターの更新に失敗しました" },
      { status: 500 }
    );
  }
}

/** DELETE: 物理削除。 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

  let adminUser;
  try {
    adminUser = await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  const { userId } = await params;
  if (!UUID_PATTERN.test(userId)) {
    return NextResponse.json({ error: "ユーザーIDが不正です" }, { status: 400 });
  }

  try {
    await removeCreatorAllowlistMember(userId);
    await logAdminAction({
      adminUserId: adminUser.id,
      actionType: "creator_allowlist_remove",
      targetType: "creator_looks_allowlist",
      targetId: userId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin creator-allowlist] DELETE error:", error);
    return NextResponse.json(
      { error: "招待クリエイターの削除に失敗しました" },
      { status: 500 }
    );
  }
}
