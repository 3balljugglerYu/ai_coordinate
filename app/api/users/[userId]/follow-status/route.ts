import { connection, NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getRouteLocale } from "@/lib/api/route-locale";
import { followRouteCopy } from "@/features/users/lib/follow-route-copy";

/**
 * フォロー状態取得API
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  await connection();
  const copy = followRouteCopy[getRouteLocale(request)];
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        { error: copy.authRequired, errorCode: "FOLLOW_AUTH_REQUIRED" },
        { status: 401 }
      );
    }
    const { userId } = await params;

    if (!userId) {
      return NextResponse.json(
        { error: copy.userIdRequired, errorCode: "FOLLOW_USER_ID_REQUIRED" },
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
          error: copy.fetchStatusFailed,
          errorCode: "FOLLOW_STATUS_FETCH_FAILED",
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
        error: copy.fetchStatusFailed,
        errorCode: "FOLLOW_STATUS_FETCH_FAILED",
      },
      { status: 500 }
    );
  }
}
