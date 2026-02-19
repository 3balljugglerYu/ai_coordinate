import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * 全件既読API
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();

    const supabase = await createClient();

    // 現在ユーザーの全通知を既読化
    const { error } = await supabase
      .from("notifications")
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq("recipient_id", user.id)
      .eq("is_read", false);

    if (error) {
      console.error("Database query error:", error);
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "全件既読化に失敗しました",
        },
        { status: 500 }
      );
    }

    revalidateTag(`notifications-${user.id}`, "max");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Mark all read API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "全件既読化に失敗しました",
      },
      { status: 500 }
    );
  }
}

