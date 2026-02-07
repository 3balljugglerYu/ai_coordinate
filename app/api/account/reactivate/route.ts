import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const user = await requireAuth();
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("cancel_account_deletion", {
      p_user_id: user.id,
    });

    if (error) {
      console.error("cancel_account_deletion error:", error);
      return NextResponse.json(
        { error: "アカウント復帰に失敗しました" },
        { status: 500 }
      );
    }

    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;

    return NextResponse.json({
      success: true,
      status: row?.status ?? "reactivated",
    });
  } catch (error) {
    console.error("Account reactivate route error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
