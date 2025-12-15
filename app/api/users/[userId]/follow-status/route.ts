import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * フォロー状態取得API
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const user = await requireAuth();
    const { userId } = await params;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // フォロー状態を確認
    const { data, error } = await supabase
      .from("follows")
      .select("id")
      .eq("follower_id", user.id)
      .eq("followee_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Database query error:", error);
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "フォロー状態の取得に失敗しました",
        },
        { status: 500 }
      );
    }

    const isFollowing = !!data;

    return NextResponse.json({ isFollowing });
  } catch (error) {
    console.error("Follow status API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "フォロー状態の取得に失敗しました",
      },
      { status: 500 }
    );
  }
}

