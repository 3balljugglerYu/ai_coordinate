import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  const { userId } = await params;

  if (!userId) {
    return NextResponse.json(
      { error: "User ID is required" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("profiles")
    .update({ deactivated_at: new Date().toISOString() })
    .eq("user_id", userId);

  if (error) {
    console.error("Admin suspend error:", error);
    return NextResponse.json(
      { error: "ユーザー停止に失敗しました" },
      { status: 500 }
    );
  }

  await logAdminAction({
    adminUserId: admin.id,
    actionType: "user_suspend",
    targetType: "user",
    targetId: userId,
  });

  return NextResponse.json({ success: true });
}
