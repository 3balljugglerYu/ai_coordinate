import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getModerationRouteCopy } from "@/features/moderation/lib/route-copy";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const copy = getModerationRouteCopy(getRouteLocale(request));

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return jsonError(copy.authRequired, "BLOCK_AUTH_REQUIRED", 401);
    }

    const { userId } = await params;
    if (!userId) {
      return jsonError(copy.userIdRequired, "BLOCK_USER_ID_REQUIRED", 400);
    }
    if (userId === user.id) {
      return jsonError(copy.cannotBlockSelf, "BLOCK_SELF_FORBIDDEN", 400);
    }

    const { error } = await supabase.from("user_blocks").insert({
      blocker_id: user.id,
      blocked_id: userId,
    });

    if (error) {
      if (error.code === "23505") {
        revalidateTag("home-posts", "max");
        revalidateTag("home-posts-week", "max");
        revalidateTag("search-posts", "max");
        return NextResponse.json({ success: true, isBlocked: true });
      }
      console.error("Block insert error:", error);
      return jsonError(copy.blockFailed, "BLOCK_CREATE_FAILED", 500);
    }

    revalidateTag("home-posts", "max");
    revalidateTag("home-posts-week", "max");
    revalidateTag("search-posts", "max");
    return NextResponse.json({ success: true, isBlocked: true });
  } catch (error) {
    console.error("Block API error:", error);
    return jsonError(copy.blockFailed, "BLOCK_CREATE_FAILED", 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const copy = getModerationRouteCopy(getRouteLocale(request));

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return jsonError(copy.authRequired, "BLOCK_AUTH_REQUIRED", 401);
    }

    const { userId } = await params;
    if (!userId) {
      return jsonError(copy.userIdRequired, "BLOCK_USER_ID_REQUIRED", 400);
    }

    const { error } = await supabase
      .from("user_blocks")
      .delete()
      .eq("blocker_id", user.id)
      .eq("blocked_id", userId);

    if (error) {
      console.error("Block delete error:", error);
      return jsonError(copy.unblockFailed, "BLOCK_DELETE_FAILED", 500);
    }

    revalidateTag("home-posts", "max");
    revalidateTag("home-posts-week", "max");
    revalidateTag("search-posts", "max");
    return NextResponse.json({ success: true, isBlocked: false });
  } catch (error) {
    console.error("Unblock API error:", error);
    return jsonError(copy.unblockFailed, "BLOCK_DELETE_FAILED", 500);
  }
}
