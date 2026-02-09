import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const { postId } = await params;
    if (!postId) {
      return NextResponse.json({ error: "投稿IDが必要です" }, { status: 400 });
    }

    const { error } = await supabase
      .from("post_reports")
      .delete()
      .eq("reporter_id", user.id)
      .eq("post_id", postId);

    if (error) {
      console.error("Withdraw report error:", error);
      return NextResponse.json({ error: "通報解除に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Withdraw report API error:", error);
    return NextResponse.json({ error: "通報解除に失敗しました" }, { status: 500 });
  }
}
