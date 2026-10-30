import { connection, NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { logAdminAction } from "@/lib/admin-audit";
import {
  addI2iAllowlistMember,
  listI2iAllowlist,
  profileExistsForI2iAllowlist,
} from "@/features/catalog-references/lib/i2i-allowlist-repository";
import { isUuid } from "@/lib/is-uuid";

export async function GET() {
  await connection();
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  try {
    const members = await listI2iAllowlist();
    return NextResponse.json(members);
  } catch (error) {
    console.error("[admin i2i-allowlist] GET error:", error);
    return NextResponse.json(
      { error: "見本を使える人の一覧の取得に失敗しました" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const originGuard = ensureSameOrigin(request);
  if (originGuard) return originGuard;

  let adminUser;
  try {
    adminUser = await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "入力が不正です" }, { status: 400 });
  }

  const userId =
    typeof (body as { userId?: unknown })?.userId === "string"
      ? (body as { userId: string }).userId
      : "";
  const noteRaw = (body as { note?: unknown })?.note;
  const note = typeof noteRaw === "string" && noteRaw.length > 0 ? noteRaw : null;
  // 表の CHECK と同じ(char_length で200文字まで。絵文字なども1文字と数える)
  if (note !== null && [...note].length > 200) {
    return NextResponse.json({ error: "メモは200文字までです" }, { status: 400 });
  }

  if (!isUuid(userId)) {
    return NextResponse.json(
      { error: "ユーザーIDが不正です" },
      { status: 400 }
    );
  }

  try {
    // 実在ユーザー(profiles)のみ許可。
    if (!(await profileExistsForI2iAllowlist(userId))) {
      return NextResponse.json(
        { error: "該当するユーザーが見つかりません" },
        { status: 400 }
      );
    }

    const { created } = await addI2iAllowlistMember({ userId, note, addedBy: adminUser.id });
    await logAdminAction({
      adminUserId: adminUser.id,
      actionType: "i2i_allowlist_add",
      targetType: "i2i_catalog_allowlist",
      targetId: userId,
      // 新しく足したのか(false ならもう一覧にいた人を有効にした)。メモを付けたか
      metadata: { created, noteUpdated: note !== null },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin i2i-allowlist] POST error:", error);
    return NextResponse.json(
      { error: "見本を使える人の追加に失敗しました" },
      { status: 500 }
    );
  }
}
