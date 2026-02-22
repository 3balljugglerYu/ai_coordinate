import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json(
      { error: "検索クエリは2文字以上で入力してください" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  if (UUID_PATTERN.test(q)) {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("user_id, nickname, avatar_url")
      .eq("user_id", q)
      .maybeSingle();

    if (error) {
      console.error("Profile search error:", error);
      return NextResponse.json(
        { error: "検索に失敗しました" },
        { status: 500 }
      );
    }

    if (!profile) {
      return NextResponse.json({ users: [] });
    }

    return NextResponse.json({
      users: [
        {
          user_id: profile.user_id,
          nickname: profile.nickname,
          avatar_url: profile.avatar_url,
        },
      ],
    });
  }

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("user_id, nickname, avatar_url")
    .ilike("nickname", `%${q}%`)
    .limit(20);

  if (error) {
    console.error("Profile search error:", error);
    return NextResponse.json(
      { error: "検索に失敗しました" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    users: (profiles || []).map((p) => ({
      user_id: p.user_id,
      nickname: p.nickname,
      avatar_url: p.avatar_url,
    })),
  });
}
