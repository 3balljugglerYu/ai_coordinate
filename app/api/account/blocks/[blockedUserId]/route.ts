import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ blockedUserId: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const { blockedUserId } = await params;
    if (!blockedUserId) {
      return NextResponse.json({ error: "ユーザーIDが必要です" }, { status: 400 });
    }

    const { error } = await supabase
      .from("user_blocks")
      .delete()
      .eq("blocker_id", user.id)
      .eq("blocked_id", blockedUserId);

    if (error) {
      console.error("Account unblock error:", error);
      return NextResponse.json({ error: "ブロック解除に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Account unblock API error:", error);
    return NextResponse.json({ error: "ブロック解除に失敗しました" }, { status: 500 });
  }
}
