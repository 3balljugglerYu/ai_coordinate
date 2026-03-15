import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getRouteLocale } from "@/lib/api/route-locale";
import { followRouteCopy } from "@/features/users/lib/follow-route-copy";

/**
 * フォロー/フォロー解除API
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
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

    if (user.id === userId) {
      return NextResponse.json(
        { error: copy.cannotFollowSelf, errorCode: "FOLLOW_CANNOT_FOLLOW_SELF" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // 既存のフォロー関係を確認
    const { data: existingFollow, error: checkError } = await supabase
      .from("follows")
      .select("id")
      .eq("follower_id", user.id)
      .eq("followee_id", userId)
      .maybeSingle();

    if (checkError) {
      console.error("Database query error:", checkError);
      return NextResponse.json(
        {
          error: copy.followStatusCheckFailed,
          errorCode: "FOLLOW_STATUS_CHECK_FAILED",
        },
        { status: 500 }
      );
    }

    if (existingFollow) {
      return NextResponse.json(
        { error: copy.alreadyFollowing, errorCode: "FOLLOW_ALREADY_EXISTS" },
        { status: 400 }
      );
    }

    // フォローを追加
    const { error: insertError } = await supabase.from("follows").insert({
      follower_id: user.id,
      followee_id: userId,
    });

    if (insertError) {
      console.error("Database query error:", insertError);
      return NextResponse.json(
        {
          error: copy.followInsertFailed,
          errorCode: "FOLLOW_INSERT_FAILED",
        },
        { status: 500 }
      );
    }

    revalidateTag(`user-profile-${userId}`, "max");
    revalidateTag(`user-profile-${user.id}`, "max");
    return NextResponse.json({ success: true, isFollowing: true });
  } catch (error) {
    console.error("Follow API error:", error);
    return NextResponse.json(
      {
        error: copy.followFailed,
        errorCode: "FOLLOW_FAILED",
      },
      { status: 500 }
    );
  }
}

/**
 * フォロー解除API
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
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

    // フォローを削除
    const { error: deleteError } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", user.id)
      .eq("followee_id", userId);

    if (deleteError) {
      console.error("Database query error:", deleteError);
      return NextResponse.json(
        {
          error: copy.unfollowFailed,
          errorCode: "UNFOLLOW_DELETE_FAILED",
        },
        { status: 500 }
      );
    }

    revalidateTag(`user-profile-${userId}`, "max");
    revalidateTag(`user-profile-${user.id}`, "max");
    return NextResponse.json({ success: true, isFollowing: false });
  } catch (error) {
    console.error("Unfollow API error:", error);
    return NextResponse.json(
      {
        error: copy.unfollowFailed,
        errorCode: "UNFOLLOW_FAILED",
      },
      { status: 500 }
    );
  }
}
