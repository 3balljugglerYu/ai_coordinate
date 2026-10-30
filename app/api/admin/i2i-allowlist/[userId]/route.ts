import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { logAdminAction } from "@/lib/admin-audit";
import {
  removeI2iAllowlistMember,
  setI2iAllowlistActive,
} from "@/features/catalog-references/lib/i2i-allowlist-repository";
import { isUuid } from "@/lib/is-uuid";

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
  if (!isUuid(userId)) {
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
    if (!(await setI2iAllowlistActive(userId, isActive))) {
      return NextResponse.json({ error: "一覧にいない人です" }, { status: 404 });
    }
    await logAdminAction({
      adminUserId: adminUser.id,
      actionType: "i2i_allowlist_update",
      targetType: "i2i_catalog_allowlist",
      targetId: userId,
      metadata: { isActive },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin i2i-allowlist] PATCH error:", error);
    return NextResponse.json(
      { error: "見本を使える人の更新に失敗しました" },
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
  if (!isUuid(userId)) {
    return NextResponse.json({ error: "ユーザーIDが不正です" }, { status: 400 });
  }

  try {
    if (!(await removeI2iAllowlistMember(userId))) {
      return NextResponse.json({ error: "一覧にいない人です" }, { status: 404 });
    }
    await logAdminAction({
      adminUserId: adminUser.id,
      actionType: "i2i_allowlist_remove",
      targetType: "i2i_catalog_allowlist",
      targetId: userId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin i2i-allowlist] DELETE error:", error);
    return NextResponse.json(
      { error: "見本を使える人の削除に失敗しました" },
      { status: 500 }
    );
  }
}
