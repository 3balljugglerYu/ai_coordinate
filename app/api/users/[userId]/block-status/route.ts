import { connection, NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getModerationRouteCopy } from "@/features/moderation/lib/route-copy";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  await connection();
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

    const [{ data: blockData, error: blockError }, { data: blockedByData, error: blockedByError }] =
      await Promise.all([
        supabase
          .from("user_blocks")
          .select("id")
          .eq("blocker_id", user.id)
          .eq("blocked_id", userId)
          .maybeSingle(),
        supabase
          .from("user_blocks")
          .select("id")
          .eq("blocker_id", userId)
          .eq("blocked_id", user.id)
          .maybeSingle(),
      ]);

    if (blockError || blockedByError) {
      console.error("Block status error:", blockError || blockedByError);
      return jsonError(copy.blockStatusFailed, "BLOCK_STATUS_FETCH_FAILED", 500);
    }

    return NextResponse.json({
      isBlocked: !!blockData,
      isBlockedBy: !!blockedByData,
    });
  } catch (error) {
    console.error("Block status API error:", error);
    return jsonError(copy.blockStatusFailed, "BLOCK_STATUS_FETCH_FAILED", 500);
  }
}
