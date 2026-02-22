import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * 未読数取得API
 * 未認証の場合は401を返す（redirectではなく）
 */
export async function GET(_request: NextRequest) {
  try {
    const user = await getUser();

    if (!user) {
      return NextResponse.json({ count: 0 });
    }

    const supabase = await createClient();

    // 未読数を取得
    const { count, error } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("recipient_id", user.id)
      .eq("is_read", false);

    if (error) {
      console.error("Database query error:", error);
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "未読数の取得に失敗しました",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ count: count || 0 });
  } catch (error) {
    console.error("Unread count API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "未読数の取得に失敗しました",
      },
      { status: 500 }
    );
  }
}

