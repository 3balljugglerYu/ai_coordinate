import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * 通知既読API
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "ids array is required" },
        { status: 400 }
      );
    }

    if (ids.length > 100) {
      return NextResponse.json(
        { error: "Maximum 100 notifications can be marked as read at once" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // 指定IDの通知を既読化
    const { error } = await supabase
      .from("notifications")
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq("recipient_id", user.id)
      .in("id", ids);

    if (error) {
      console.error("Database query error:", error);
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "通知の既読化に失敗しました",
        },
        { status: 500 }
      );
    }

    revalidateTag(`notifications-${user.id}`, "max");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Mark read API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "通知の既読化に失敗しました",
      },
      { status: 500 }
    );
  }
}

