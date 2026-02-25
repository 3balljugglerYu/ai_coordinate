import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { FreePercoinBatchExpiring } from "@/features/credits/lib/free-percoin-expiration";

/**
 * 期限が近い無償コイン一覧と今月末失効予定数を取得
 * 認証必須
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [batchesResult, countResult] = await Promise.all([
      supabase.rpc("get_free_percoin_batches_expiring", { p_user_id: user.id }),
      supabase.rpc("get_expiring_this_month_count", { p_user_id: user.id }),
    ]);

    if (batchesResult.error) {
      console.error("get_free_percoin_batches_expiring error:", batchesResult.error);
      return NextResponse.json(
        { error: "Failed to retrieve expiring batches" },
        { status: 500 }
      );
    }

    if (countResult.error) {
      console.error("get_expiring_this_month_count error:", countResult.error);
      return NextResponse.json(
        { error: "Failed to retrieve expiring count" },
        { status: 500 }
      );
    }

    const batches: FreePercoinBatchExpiring[] = (batchesResult.data ?? []).map(
      (row: Record<string, unknown>) => ({
        id: String(row.id ?? ""),
        user_id: String(row.user_id ?? ""),
        remaining_amount: Number(row.remaining_amount ?? 0),
        expire_at: String(row.expire_at ?? ""),
        source: String(row.source ?? ""),
      })
    );

    const countRow = Array.isArray(countResult.data) ? countResult.data[0] : countResult.data;
    const expiring_this_month = Number(
      (countRow as { expiring_this_month?: number })?.expiring_this_month ?? 0
    );

    return NextResponse.json({
      batches,
      expiring_this_month,
    });
  } catch (error) {
    console.error("Free percoin expiring route error:", error);
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500 }
    );
  }
}
