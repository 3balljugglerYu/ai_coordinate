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

    /*
      すでにフォローしている状態で POST されるのは異常ではない。

      フィードの「フォローして生成する」のように、フォロー状態を取得できて
      いない画面から押される正常な経路がある。ここで 400 を返すと、呼び出し側は
      「押せたのに先へ進めない」になり、フォロー済みの人ほど詰まる。
      DELETE は元々存在しない行を消しても成功するので、POST も同じく冪等にする。

      結果の状態は同じなので revalidateTag は行わない(何も変わっていない)。
      ただし `created: false` は返す。呼び出し側が「カードからフォローされた」を
      計測しているので、実際には増えていないものを数に含めさせない。
    */
    if (existingFollow) {
      return NextResponse.json({ success: true, isFollowing: true, created: false });
    }

    // フォローを追加
    const { error: insertError } = await supabase.from("follows").insert({
      follower_id: user.id,
      followee_id: userId,
    });

    if (insertError) {
      /*
        `follows` の UNIQUE(follower_id, followee_id) 競合(23505)も冪等に扱う。

        上の存在確認と INSERT のあいだに、別タブ・別カード・再送などの
        同時リクエストが同じ行を作ることがある。読んでから書くまでの隙間は
        アプリ側では閉じられないので、競合したという結果そのものを
        「すでにフォロー済み」と読み替える。求める状態は成立している。

        ここを 500 にすると、正常な重複リクエストが「押せたのに進めない」に
        なるうえ、エラーログにも積み上がる。
      */
      if (insertError.code === "23505") {
        return NextResponse.json({
          success: true,
          isFollowing: true,
          created: false,
        });
      }

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
    return NextResponse.json({ success: true, isFollowing: true, created: true });
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
