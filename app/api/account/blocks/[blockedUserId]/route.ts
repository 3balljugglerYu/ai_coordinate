import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getAccountRouteCopy } from "@/features/account/lib/route-copy";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ blockedUserId: string }> }
) {
  const copy = getAccountRouteCopy(getRouteLocale(request));

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return jsonError(copy.authRequired, "ACCOUNT_AUTH_REQUIRED", 401);
    }

    const { blockedUserId } = await params;
    if (!blockedUserId) {
      return jsonError(copy.blockedUserIdRequired, "ACCOUNT_BLOCKED_USER_ID_REQUIRED", 400);
    }

    const { error } = await supabase
      .from("user_blocks")
      .delete()
      .eq("blocker_id", user.id)
      .eq("blocked_id", blockedUserId);

    if (error) {
      console.error("Account unblock error:", error);
      return jsonError(copy.unblockFailed, "ACCOUNT_BLOCK_DELETE_FAILED", 500);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Account unblock API error:", error);
    return jsonError(copy.unblockFailed, "ACCOUNT_BLOCK_DELETE_FAILED", 500);
  }
}
