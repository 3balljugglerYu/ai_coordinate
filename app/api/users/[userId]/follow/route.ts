import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * フォロー/フォロー解除API
 */
export async function POST(
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

    if (user.id === userId) {
      return NextResponse.json(
        { error: "Cannot follow yourself" },
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
          error:
            checkError instanceof Error
              ? checkError.message
              : "フォロー状態の確認に失敗しました",
        },
        { status: 500 }
      );
    }

    if (existingFollow) {
      return NextResponse.json(
        { error: "Already following this user" },
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
          error:
            insertError instanceof Error
              ? insertError.message
              : "フォローの追加に失敗しました",
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
        error:
          error instanceof Error
            ? error.message
            : "フォローの処理に失敗しました",
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
          error:
            deleteError instanceof Error
              ? deleteError.message
              : "フォロー解除に失敗しました",
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
        error:
          error instanceof Error
            ? error.message
            : "フォロー解除の処理に失敗しました",
      },
      { status: 500 }
    );
  }
}

