import { connection, NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPostThumbUrl } from "@/features/posts/lib/utils";
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

    const { data: reports, error: reportsError } = await supabase
      .from("post_reports")
      .select("post_id,category_id,subcategory_id,created_at")
      .eq("reporter_id", user.id)
      .order("created_at", { ascending: false });

    if (reportsError) {
      console.error("Account reports fetch error:", reportsError);
      return jsonError(
        copy.reportedContentsFetchFailed,
        "ACCOUNT_REPORTS_FETCH_FAILED",
        500
      );
    }

    const postIds = Array.from(
      new Set((reports || []).map((row) => row.post_id).filter((id): id is string => Boolean(id)))
    );

    let postMap: Record<
      string,
      {
        id: string;
        image_url: string | null;
        storage_path_thumb?: string | null;
        storage_path?: string | null;
        caption: string | null;
        is_posted: boolean;
        moderation_status: "visible" | "pending" | "removed" | null;
      }
    > = {};

    if (postIds.length > 0) {
      const { data: posts, error: postsError } = await supabase
        .from("generated_images")
        .select("id,image_url,storage_path_thumb,storage_path,caption,is_posted,moderation_status")
        .in("id", postIds);

      if (postsError) {
        console.error("Reported posts fetch error:", postsError);
        return jsonError(
          copy.reportedPostsFetchFailed,
          "ACCOUNT_REPORTED_POSTS_FETCH_FAILED",
          500
        );
      }

      postMap = (posts || []).reduce((acc, post) => {
        acc[post.id] = post;
        return acc;
      }, {} as typeof postMap);
    }

    return NextResponse.json({
      items: (reports || []).map((row) => {
        const post = postMap[row.post_id];
        const imageUrl = post ? getPostThumbUrl(post) || null : null;
        return {
          postId: row.post_id,
          categoryId: row.category_id,
          subcategoryId: row.subcategory_id,
          reportedAt: row.created_at,
          imageUrl,
          caption: post?.caption ?? null,
          isPosted: post?.is_posted ?? false,
          moderationStatus: post?.moderation_status ?? null,
        };
      }),
    });
  } catch (error) {
    console.error("Account reports API error:", error);
    return jsonError(copy.reportedContentsFetchFailed, "ACCOUNT_REPORTS_FETCH_FAILED", 500);
  }
}
