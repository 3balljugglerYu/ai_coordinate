import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(
    parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10),
    MAX_LIMIT
  );
  const offset = Math.max(
    parseInt(searchParams.get("offset") || "0", 10),
    0
  );
  const sort = searchParams.get("sort") || "created_at_desc";
  const q = searchParams.get("q")?.trim();

  const supabase = createAdminClient();

  let orderCol: "created_at" | "nickname" = "created_at";
  let orderAsc = false;
  if (sort === "created_at_asc") {
    orderCol = "created_at";
    orderAsc = true;
  } else if (sort === "nickname_asc") {
    orderCol = "nickname";
    orderAsc = true;
  } else if (sort === "nickname_desc") {
    orderCol = "nickname";
    orderAsc = false;
  }

  let query = supabase
    .from("profiles")
    .select("user_id, nickname, avatar_url, created_at", { count: "exact" })
    .order(orderCol, {
      ascending: orderAsc,
      ...(orderCol === "nickname" && { nullsFirst: false }),
    });

  if (q && q.length >= 1) {
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidPattern.test(q)) {
      query = query.eq("user_id", q);
    } else {
      const escaped = q.replace(/[%_\\]/g, "\\$&");
      query = query.ilike("nickname", `%${escaped}%`);
    }
  }

  const { data: profiles, error, count } = await query.range(
    offset,
    offset + limit - 1
  );

  if (error) {
    console.error("Profiles list error:", error);
    return NextResponse.json(
      { error: "ユーザー一覧の取得に失敗しました" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    users: profiles || [],
    total: count ?? (profiles?.length ?? 0),
    limit,
    offset,
  });
}
