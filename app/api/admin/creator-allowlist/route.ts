import { connection, NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ensureSameOrigin } from "@/lib/security/same-origin";
import { logAdminAction } from "@/lib/admin-audit";
import {
  addCreatorAllowlistMember,
  listCreatorAllowlist,
  profileExistsForUserId,
} from "@/features/creators/lib/creator-allowlist-repository";
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
    const members = await listCreatorAllowlist();
    return NextResponse.json(members);
  } catch (error) {
    console.error("[admin creator-allowlist] GET error:", error);
    return NextResponse.json(
      { error: "招待クリエイター一覧の取得に失敗しました" },
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

  if (!isUuid(userId)) {
    return NextResponse.json(
      { error: "ユーザーIDが不正です" },
      { status: 400 }
    );
  }

  try {
    // 実在ユーザー(profiles)のみ許可。
    if (!(await profileExistsForUserId(userId))) {
      return NextResponse.json(
        { error: "該当するユーザーが見つかりません" },
        { status: 400 }
      );
    }

    await addCreatorAllowlistMember({ userId, note, addedBy: adminUser.id });
    await logAdminAction({
      adminUserId: adminUser.id,
      actionType: "creator_allowlist_add",
      targetType: "creator_looks_allowlist",
      targetId: userId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[admin creator-allowlist] POST error:", error);
    return NextResponse.json(
      { error: "招待クリエイターの追加に失敗しました" },
      { status: 500 }
    );
  }
}
