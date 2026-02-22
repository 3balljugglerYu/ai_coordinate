import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPostThumbUrl } from "@/features/posts/lib/utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  const { userId } = await params;

  if (!userId) {
    return NextResponse.json(
      { error: "User ID is required" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  const [profileResult, generatedResult, postedResult, commentsResult, transactionsResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("user_id, nickname, avatar_url, bio")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("generated_images")
        .select(
          "id, caption, storage_path, storage_path_thumb, storage_path_display, created_at"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("generated_images")
        .select(
          "id, caption, storage_path, storage_path_thumb, storage_path_display, is_posted, moderation_status, posted_at, created_at"
        )
        .eq("user_id", userId)
        .eq("is_posted", true)
        .order("posted_at", { ascending: false })
        .limit(50),
      supabase
        .from("comments")
        .select("id, image_id, content, created_at")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("credit_transactions")
        .select("id, amount, transaction_type, metadata, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  if (profileResult.error) {
    console.error("Profile fetch error:", profileResult.error);
    return NextResponse.json(
      { error: "プロフィールの取得に失敗しました" },
      { status: 500 }
    );
  }

  if (!profileResult.data) {
    return NextResponse.json(
      { error: "ユーザーが見つかりません" },
      { status: 404 }
    );
  }

  const generated = generatedResult.data || [];
  const posted = postedResult.data || [];
  const comments = commentsResult.data || [];
  const transactions = transactionsResult.data || [];

  const imageIds = [
    ...new Set([
      ...posted.map((p) => p.id),
      ...comments.map((c) => c.image_id),
    ]),
  ].filter(Boolean);

  let postCaptions: Record<string, string> = {};
  if (imageIds.length > 0) {
    const { data: images } = await supabase
      .from("generated_images")
      .select("id, caption")
      .in("id", imageIds);
    if (images) {
      postCaptions = Object.fromEntries(
        images.map((img) => [img.id, img.caption || ""])
      );
    }
  }

  return NextResponse.json({
    profile: {
      user_id: profileResult.data.user_id,
      nickname: profileResult.data.nickname,
      avatar_url: profileResult.data.avatar_url,
      bio: profileResult.data.bio,
    },
    generated: generated.map((img) => ({
      ...img,
      thumb_url: getPostThumbUrl(img),
    })),
    posted: posted.map((img) => ({
      ...img,
      thumb_url: getPostThumbUrl(img),
    })),
    comments: comments.map((c) => ({
      ...c,
      post_caption: postCaptions[c.image_id] || null,
    })),
    transactions,
  });
}
