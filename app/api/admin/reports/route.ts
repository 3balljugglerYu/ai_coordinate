import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPostThumbUrl } from "@/features/posts/lib/utils";
import { REPORT_TAXONOMY } from "@/constants/report-taxonomy";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function getCategoryLabel(categoryId: string): string {
  const cat = REPORT_TAXONOMY.find((c) => c.id === categoryId);
  return cat?.label ?? categoryId;
}

function getSubcategoryLabel(categoryId: string, subcategoryId: string): string {
  const cat = REPORT_TAXONOMY.find((c) => c.id === categoryId);
  const sub = cat?.subcategories.find((s) => s.id === subcategoryId);
  return sub?.label ?? subcategoryId;
}

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

  const supabase = createAdminClient();

  const { data: reports, error } = await supabase
    .from("post_reports")
    .select("id, post_id, reporter_id, category_id, subcategory_id, details, weight, created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Admin reports fetch error:", error);
    return NextResponse.json(
      { error: "通報一覧の取得に失敗しました" },
      { status: 500 }
    );
  }

  const postIds = Array.from(
    new Set(
      (reports || []).map((r) => r.post_id).filter((id): id is string => Boolean(id))
    )
  );
  const reporterIds = Array.from(
    new Set(
      (reports || []).map((r) => r.reporter_id).filter((id): id is string => Boolean(id))
    )
  );

  let postMap: Record<
    string,
    {
      id: string;
      image_url: string | null;
      storage_path_thumb?: string | null;
      storage_path?: string | null;
      caption: string | null;
      user_id: string | null;
      moderation_status: string | null;
    }
  > = {};
  let profileMap: Record<string, { nickname: string | null }> = {};

  if (postIds.length > 0) {
    const { data: posts } = await supabase
      .from("generated_images")
      .select("id, image_url, storage_path_thumb, storage_path, caption, user_id, moderation_status")
      .in("id", postIds);
    postMap = (posts || []).reduce((acc, p) => {
      acc[p.id] = p;
      return acc;
    }, {} as typeof postMap);
  }

  if (reporterIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, nickname")
      .in("user_id", reporterIds);
    profileMap = (profiles || []).reduce((acc, p) => {
      acc[p.user_id] = { nickname: p.nickname ?? null };
      return acc;
    }, {} as typeof profileMap);
  }

  const { count } = await supabase
    .from("post_reports")
    .select("*", { count: "exact", head: true });

  const items = (reports || []).map((r) => {
    const post = r.post_id ? postMap[r.post_id] : null;
    const reporterProfile = r.reporter_id ? profileMap[r.reporter_id] : null;
    return {
      id: r.id,
      postId: r.post_id,
      reporterId: r.reporter_id,
      reporterNickname: reporterProfile?.nickname ?? null,
      categoryId: r.category_id,
      categoryLabel: getCategoryLabel(r.category_id ?? ""),
      subcategoryId: r.subcategory_id,
      subcategoryLabel: getSubcategoryLabel(r.category_id ?? "", r.subcategory_id ?? ""),
      details: r.details ?? null,
      weight: r.weight ?? 0,
      createdAt: r.created_at,
      postImageUrl: post ? getPostThumbUrl(post) : null,
      postCaption: post?.caption ?? null,
      postModerationStatus: post?.moderation_status ?? null,
    };
  });

  return NextResponse.json({
    items,
    total: count ?? 0,
    limit,
    offset,
  });
}
