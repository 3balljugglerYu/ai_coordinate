import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId } = await params;
    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const [{ data: blockData, error: blockError }, { data: blockedByData, error: blockedByError }] =
      await Promise.all([
        supabase
          .from("user_blocks")
          .select("id")
          .eq("blocker_id", user.id)
          .eq("blocked_id", userId)
          .maybeSingle(),
        supabase
          .from("user_blocks")
          .select("id")
          .eq("blocker_id", userId)
          .eq("blocked_id", user.id)
          .maybeSingle(),
      ]);

    if (blockError || blockedByError) {
      console.error("Block status error:", blockError || blockedByError);
      return NextResponse.json({ error: "Failed to get block status" }, { status: 500 });
    }

    return NextResponse.json({
      isBlocked: !!blockData,
      isBlockedBy: !!blockedByData,
    });
  } catch (error) {
    console.error("Block status API error:", error);
    return NextResponse.json(
      { error: "ブロック状態の取得に失敗しました" },
      { status: 500 }
    );
  }
}
