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

    const { data: reports, error: reportsError } = await supabase
      .from("post_reports")
      .select("post_id,category_id,subcategory_id,created_at")
      .eq("reporter_id", user.id)
      .order("created_at", { ascending: false });

    if (reportsError) {
      console.error("Account reports fetch error:", reportsError);
      return NextResponse.json(
        { error: "通報済みコンテンツ一覧の取得に失敗しました" },
        { status: 500 }
      );
    }

    const postIds = Array.from(
      new Set((reports || []).map((row) => row.post_id).filter((id): id is string => Boolean(id)))
    );

    let postMap: Record<
      string,
      {
        id: string;
        image_url: string;
        caption: string | null;
        is_posted: boolean;
        moderation_status: "visible" | "pending" | "removed" | null;
      }
    > = {};

    if (postIds.length > 0) {
      const { data: posts, error: postsError } = await supabase
        .from("generated_images")
        .select("id,image_url,caption,is_posted,moderation_status")
        .in("id", postIds);

      if (postsError) {
        console.error("Reported posts fetch error:", postsError);
        return NextResponse.json(
          { error: "通報対象投稿の取得に失敗しました" },
          { status: 500 }
        );
      }

      postMap = (posts || []).reduce((acc, post) => {
        acc[post.id] = post;
        return acc;
      }, {} as typeof postMap);
    }

    return NextResponse.json({
      items: (reports || []).map((row) => ({
        postId: row.post_id,
        categoryId: row.category_id,
        subcategoryId: row.subcategory_id,
        reportedAt: row.created_at,
        imageUrl: postMap[row.post_id]?.image_url ?? null,
        caption: postMap[row.post_id]?.caption ?? null,
        isPosted: postMap[row.post_id]?.is_posted ?? false,
        moderationStatus: postMap[row.post_id]?.moderation_status ?? null,
      })),
    });
  } catch (error) {
    console.error("Account reports API error:", error);
    return NextResponse.json(
      { error: "通報済みコンテンツ一覧の取得に失敗しました" },
      { status: 500 }
    );
  }
}
