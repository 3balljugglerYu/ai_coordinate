import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * 未読数取得API
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();

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

