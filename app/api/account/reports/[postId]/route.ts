import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/api/json-error";
import { getRouteLocale } from "@/lib/api/route-locale";
import { getAccountRouteCopy } from "@/features/account/lib/route-copy";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
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

    const { postId } = await params;
    if (!postId) {
      return jsonError(copy.postIdRequired, "ACCOUNT_REPORT_POST_ID_REQUIRED", 400);
    }

    const { error } = await supabase
      .from("post_reports")
      .delete()
      .eq("reporter_id", user.id)
      .eq("post_id", postId);

    if (error) {
      console.error("Withdraw report error:", error);
      return jsonError(copy.withdrawReportFailed, "ACCOUNT_REPORT_WITHDRAW_FAILED", 500);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Withdraw report API error:", error);
    return jsonError(copy.withdrawReportFailed, "ACCOUNT_REPORT_WITHDRAW_FAILED", 500);
  }
}
