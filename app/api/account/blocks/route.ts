import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const { data: blocks, error: blocksError } = await supabase
      .from("user_blocks")
      .select("blocked_id,created_at")
      .eq("blocker_id", user.id)
      .order("created_at", { ascending: false });

    if (blocksError) {
      console.error("Blocks fetch error:", blocksError);
      return NextResponse.json(
        { error: "ブロックユーザー一覧の取得に失敗しました" },
        { status: 500 }
      );
    }

    const blockedUserIds = (blocks || [])
      .map((row) => row.blocked_id)
      .filter((id): id is string => Boolean(id));

    let profileMap: Record<string, { nickname: string | null; avatar_url: string | null }> = {};
    if (blockedUserIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id,nickname,avatar_url")
        .in("user_id", blockedUserIds);

      if (profilesError) {
        console.error("Blocked user profiles fetch error:", profilesError);
        return NextResponse.json(
          { error: "ブロックユーザー情報の取得に失敗しました" },
          { status: 500 }
        );
      }

      profileMap = (profiles || []).reduce((acc, profile) => {
        acc[profile.user_id] = {
          nickname: profile.nickname,
          avatar_url: profile.avatar_url,
        };
        return acc;
      }, {} as Record<string, { nickname: string | null; avatar_url: string | null }>);
    }

    return NextResponse.json({
      items: (blocks || []).map((row) => ({
        userId: row.blocked_id,
        nickname: profileMap[row.blocked_id]?.nickname ?? null,
        avatarUrl: profileMap[row.blocked_id]?.avatar_url ?? null,
        blockedAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error("Account blocks API error:", error);
    return NextResponse.json(
      { error: "ブロックユーザー一覧の取得に失敗しました" },
      { status: 500 }
    );
  }
}
