import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isCollectionFeedPostEnabled } from "@/lib/env";
import { postCompletionToFeed } from "@/features/collections/lib/completion-feed-post";

/**
 * 完走フィード投稿(オプトイン)API。
 * - POST  : 完走をホームフィードに投稿(冪等。再投稿は同一行を再活性化)
 * - DELETE: 投稿を取り消す(is_posted=false。完走本体と /m/<token> は無傷)
 * - GET   : 当該完走が投稿済みかを返す(モーダルの状態表示用)
 *
 * 機能フラグ `NEXT_PUBLIC_COLLECTION_FEED_POST_ENABLED` OFF 時は全メソッド 403。
 * 所有権は RPC / RLS が auth.uid() で強制(本ルートは body から user を受け取らない)。
 */

const MAX_CAPTION_LENGTH = 140;

function flagGuard(): NextResponse | null {
  if (!isCollectionFeedPostEnabled()) {
    return NextResponse.json({ error: "feature_disabled" }, { status: 403 });
  }
  return null;
}

/** 投稿/取消後にフィード・詳細・マイページ・モーダル状態・シェアページを失効させる。 */
function revalidateAfterChange(userId: string, completionId: string, postId?: string) {
  revalidateTag("home-posts", "max");
  revalidateTag("home-posts-week", "max");
  revalidateTag("search-posts", "max");
  revalidateTag(`user-profile-${userId}`, "max");
  revalidateTag(`my-page-${userId}`, "max");
  // 完走モーダルの「投稿済み」状態(CachedMyPageCollections が消費)
  revalidateTag(`collection-completions:${userId}`, "max");
  if (postId) {
    revalidateTag(`post-detail-${postId}`, { expire: 0 });
  }
  revalidatePath("/");
  revalidatePath(`/m/${completionId}`);
  revalidatePath(`/m/${completionId}/book`);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = flagGuard();
  if (denied) return denied;

  const { id: completionId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let caption: string | null = null;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      caption?: unknown;
    };
    if (typeof body.caption === "string") {
      const trimmed = body.caption.trim().slice(0, MAX_CAPTION_LENGTH);
      caption = trimmed.length > 0 ? trimmed : null;
    }
  } catch {
    caption = null;
  }

  try {
    const { postId } = await postCompletionToFeed(supabase, completionId, caption);
    revalidateAfterChange(user.id, completionId, postId);
    return NextResponse.json({ posted: true, postId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    // 所有権/状態のDB層エラーをHTTPに写す
    if (message.includes("forbidden")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (message.includes("not found")) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (message.includes("not completed") || message.includes("not ready")) {
      return NextResponse.json({ error: "not_completed" }, { status: 409 });
    }
    console.error("[completion feed post POST] failed:", message);
    return NextResponse.json({ error: "post_failed" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = flagGuard();
  if (denied) return denied;

  const { id: completionId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 取消は is_posted=false(行は保持=再投稿で復活)。RLS により本人行のみ更新可。
  const { error } = await supabase
    .from("generated_images")
    .update({ is_posted: false, posted_at: null, caption: null })
    .eq("completion_id", completionId)
    .eq("user_id", user.id);
  if (error) {
    console.error("[completion feed post DELETE] failed:", error.message);
    return NextResponse.json({ error: "cancel_failed" }, { status: 500 });
  }
  revalidateAfterChange(user.id, completionId);
  return NextResponse.json({ posted: false });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: completionId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ posted: false, postId: null });
  }
  const { data } = await supabase
    .from("generated_images")
    .select("id")
    .eq("completion_id", completionId)
    .eq("user_id", user.id)
    .eq("is_posted", true)
    .maybeSingle();
  return NextResponse.json({ posted: !!data, postId: data?.id ?? null });
}
