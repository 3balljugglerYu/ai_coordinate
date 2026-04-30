import { connection, NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getAccountRouteCopy } from "@/features/account/lib/route-copy";

export async function GET(request: NextRequest) {
  await connection();
  const copy = getAccountRouteCopy(getRouteLocale(request));

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return jsonError(copy.authRequired, "ACCOUNT_AUTH_REQUIRED", 401);
    }

    const { data: blocks, error: blocksError } = await supabase
      .from("user_blocks")
      .select("blocked_id,created_at")
      .eq("blocker_id", user.id)
      .order("created_at", { ascending: false });

    if (blocksError) {
      console.error("Blocks fetch error:", blocksError);
      return jsonError(
        copy.blockedUsersFetchFailed,
        "ACCOUNT_BLOCKS_FETCH_FAILED",
        500
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
        return jsonError(
          copy.blockedUserProfilesFetchFailed,
          "ACCOUNT_BLOCKED_PROFILES_FETCH_FAILED",
          500
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
    return jsonError(copy.blockedUsersFetchFailed, "ACCOUNT_BLOCKS_FETCH_FAILED", 500);
  }
}
