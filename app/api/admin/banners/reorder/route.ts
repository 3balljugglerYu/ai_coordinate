/**
 * バナー表示順の一括更新API
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST: バナー表示順を一括更新
 * Body: { "order": ["id1", "id2", "id3", ...] } - 新しい順序のID配列
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }

  try {
    const body = await request.json();
    const order = body?.order as string[] | undefined;

    if (!Array.isArray(order) || order.length === 0) {
      return NextResponse.json(
        { error: "order はIDの配列で指定してください" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // 各バナーの display_order を更新
    const updates = order.map((id, index) =>
      supabase.from("banners").update({ display_order: index }).eq("id", id)
    );

    const results = await Promise.all(updates);

    const hasError = results.some((r) => r.error);
    if (hasError) {
      const firstError = results.find((r) => r.error);
      console.error("[Admin Banners] Reorder error:", firstError?.error);
      return NextResponse.json(
        { error: "表示順の更新に失敗しました" },
        { status: 500 }
      );
    }

    revalidateTag("banners", "max");
    revalidatePath("/");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Admin Banners] Reorder error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "表示順の更新に失敗しました",
      },
      { status: 500 }
    );
  }
}
